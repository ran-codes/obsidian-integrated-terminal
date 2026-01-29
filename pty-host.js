// PTY Host - Sidecar process for Obsidian VS Code Terminal
// Runs under system Node.js (not Electron) to avoid native module issues.
// Communicates with the plugin via IPC (process.send / process.on('message')).

const path = require('path');

let pty;
try {
	pty = require(path.join(__dirname, 'node_modules', 'node-pty'));
} catch (e) {
	process.send({ type: 'error', message: 'Failed to load node-pty: ' + e.message });
	process.exit(1);
}

let ptyProcess = null;

process.on('message', (msg) => {
	switch (msg.type) {
		case 'spawn': {
			if (ptyProcess) {
				try { ptyProcess.kill(); } catch {}
				ptyProcess = null;
			}

			try {
				ptyProcess = pty.spawn(msg.shell, msg.args || [], {
					name: 'xterm-256color',
					cwd: msg.cwd || process.cwd(),
					env: { ...process.env, TERM: 'xterm-256color' },
					cols: msg.cols || 80,
					rows: msg.rows || 24,
				});

				ptyProcess.onData((data) => {
					try {
						process.send({ type: 'data', data: data });
					} catch {}
				});

				ptyProcess.onExit(({ exitCode, signal }) => {
					try {
						process.send({ type: 'exit', exitCode: exitCode, signal: signal });
					} catch {}
					ptyProcess = null;
				});

				process.send({ type: 'spawned' });
			} catch (e) {
				process.send({ type: 'error', message: 'Failed to spawn: ' + e.message });
			}
			break;
		}

		case 'write':
			if (ptyProcess) {
				ptyProcess.write(msg.data);
			}
			break;

		case 'resize':
			if (ptyProcess) {
				try {
					ptyProcess.resize(msg.cols, msg.rows);
				} catch {}
			}
			break;

		case 'kill':
			if (ptyProcess) {
				try { ptyProcess.kill(); } catch {}
				ptyProcess = null;
			}
			process.exit(0);
			break;
	}
});

// Clean up on disconnect
process.on('disconnect', () => {
	if (ptyProcess) {
		try { ptyProcess.kill(); } catch {}
	}
	process.exit(0);
});

// Signal ready
process.send({ type: 'ready' });
