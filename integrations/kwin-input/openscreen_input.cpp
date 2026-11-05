// SPDX-License-Identifier: GPL-2.0-or-later
// Standalone optional KWin plugin. No Panoptix source is used.
#include <effect/effect.h>
#include <input.h>
#include <input_event.h>
#include <input_event_spy.h>
#include <core/inputdevice.h>
#include <QDir>
#include <QLocalServer>
#include <QLocalSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>

class OpenScreenInput final : public KWin::Effect, public KWin::InputEventSpy
{
    Q_OBJECT
public:
    OpenScreenInput()
    {
        // UserAccessOption restricts the socket to this desktop user. Do not
        // unlink a live/stale path: another plugin instance may own it.
        m_server.setSocketOptions(QLocalServer::UserAccessOption);
        const auto runtime = QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation);
        if (runtime.isEmpty()) return;
        connect(&m_server, &QLocalServer::newConnection, this, [this] {
            while (m_server.hasPendingConnections()) {
                auto *socket = m_server.nextPendingConnection();
                if (m_client) { socket->abort(); socket->deleteLater(); continue; }
                socket->setReadBufferSize(1);
                m_client = socket;
                m_sequence = 0;
                socket->write("openscreen-kwin-buttons-v1\n");
                connect(socket, &QLocalSocket::disconnected, this, [this, socket] {
                    if (m_client == socket) m_client = nullptr;
                    socket->deleteLater();
                });
            }
        });
        if (m_server.listen(QDir(runtime).filePath("openscreen-kwin-input-v1.sock"))) {
            KWin::input()->installInputEventSpy(this);
        }
    }

    ~OpenScreenInput() override
    {
        // Stop callbacks before member destruction closes the accepted socket.
        if (m_client) { m_client->disconnect(this); m_client->abort(); }
    }

    bool isActive() const override { return false; } // no painting or input interception

    void pointerButton(KWin::PointerButtonEvent *event) override
    {
        if (!m_client || event->nativeButton < 0x110 || event->nativeButton > 0x117) return;
        // Queue every edge, including libinput-synthesized tap down/up. If a
        // consumer stalls, close visibly instead of silently discarding events
        // or allowing unbounded memory growth in the compositor.
        if (m_client->bytesToWrite() > 1024 * 1024) { m_client->abort(); return; }
        const QJsonObject edge{
            {"sequence", static_cast<qint64>(m_sequence++)},
            {"code", static_cast<int>(event->nativeButton)},
            {"pressed", event->state == KWin::PointerButtonState::Pressed},
        };
        const auto record = QJsonDocument(edge).toJson(QJsonDocument::Compact) + '\n';
        if (m_client->write(record) != record.size()) m_client->abort();
    }
private:
    QLocalServer m_server;
    QLocalSocket *m_client = nullptr;
    quint64 m_sequence = 0;
};

KWIN_EFFECT_FACTORY_ENABLED(OpenScreenInput, "metadata.json", return false;)
#include "openscreen_input.moc"
