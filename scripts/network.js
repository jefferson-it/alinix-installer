export async function configNetwork() {
    if (!await testNetwork()) {
        Deno.writeFileSync('/etc/resolve.conf', encode.encode('nameserver 8.8.8.8\nnameserver 1.1.1.1'));
        Deno.writeFileSync(`${tmpFolder}/etc/resolve.conf`, encode.encode('nameserver 8.8.8.8\nnameserver 1.1.1.1'));
    }
}

export async function testNetwork() {
    const cmd = new Deno.Command("ping", {
        args: ["-c", "1", "8.8.8.8"],
        stdout: "piped",
        stderr: "piped",
    });

    const { code } = await cmd.output();
    return code === 0;
}
