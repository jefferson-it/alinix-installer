
// deno-lint-ignore no-explicit-any
export async function execCmd(cmd: string | URL, args?: any[]) {
    if (!args) args = [];

    console.log(`Executando: ${cmd} ${args.join(" ")}`);

    const process = new Deno.Command(cmd, {
        args,
        stdout: "piped",
        stderr: "piped",
    }).spawn();

    const decoder = new TextDecoder();
    const stdoutReader = process.stdout.getReader();
    const stderrReader = process.stderr.getReader();

    let fullOut = "";
    let fullErr = "";

    const stdoutPump = (async () => {
        for await (const chunk of readStream(stdoutReader, decoder)) {
            fullOut += chunk;
            if (chunk.trim()) console.log(chunk);
        }
    })();

    const stderrPump = (async () => {
        for await (const chunk of readStream(stderrReader, decoder)) {
            fullErr += chunk;
            if (chunk.trim()) console.error(`[ ! ] ${chunk}`);
        }
    })();

    const status = await process.status;
    await Promise.all([stdoutPump, stderrPump]);

    if (!status.success) {
        throw new Error(
            `[ X ] Falha ao executar: ${cmd} ${args.join(" ")}\n--- STDERR ---\n${fullErr}`
        );
    }

    return fullOut.trim();
}

async function* readStream(reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>, decoder: TextDecoder) {
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield decoder.decode(value);
    }
}
