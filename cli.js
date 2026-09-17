import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const COMMAND_TIMEOUT_SECONDS = 20;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 3;

export class WindscribeCli {
    constructor(binary = 'windscribe-cli') {
        this._binary = binary;
        this._queue = Promise.resolve();
    }

    run(args) {
        const job = this._queue.catch(() => {}).then(() => this._runWithRetry(args));
        this._queue = job.catch(() => {});
        return job;
    }

    _runWithRetry(args) {
        const attempt = retries => this._run(args).catch(error => {
            const busy = /already running/i.test(String(error.message || ''));
            if (busy && retries < MAX_RETRIES) {
                return new Promise(resolve => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_DELAY_MS, () => {
                        resolve(attempt(retries + 1));
                        return GLib.SOURCE_REMOVE;
                    });
                });
            }
            throw error;
        });
        return attempt(0);
    }

    _run(args) {
        return new Promise((resolve, reject) => {
            let process;
            try {
                process = Gio.Subprocess.new(
                    [this._binary, ...args],
                    Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_PIPE,
                );
            } catch (error) {
                reject(error);
                return;
            }

            let settled = false;
            const timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                COMMAND_TIMEOUT_SECONDS,
                () => {
                    if (!settled)
                        process.force_exit();
                    return GLib.SOURCE_REMOVE;
                },
            );

            process.communicate_utf8_async(null, null, (source, result) => {
                if (settled)
                    return;

                settled = true;
                GLib.Source.remove(timeoutId);

                try {
                    const [ok, stdout, stderr] = source.communicate_utf8_finish(result);
                    const status = source.get_exit_status();
                    const output = {
                        ok: ok && status === 0,
                        status,
                        stdout: stdout ?? '',
                        stderr: stderr ?? '',
                    };

                    if (output.ok)
                        resolve(output);
                    else
                        reject(Object.assign(new Error(this._error(output)), output));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _error(result) {
        const message = result.stderr.trim() || result.stdout.trim();
        return message || `windscribe-cli exited with status ${result.status}`;
    }
}
