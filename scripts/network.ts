export async function configNetwork() {
    if (!await testNetwork()) {
        Deno.writeFileSync('/etc/resolve.conf', encode.encode('nameserver 8.8.8.8\nnameserver 1.1.1.1'));
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


export async function chrootTestNetwork() {
    const cmd = new Deno.Command('chroot', {
        args: [tmpFolder, '/bin/bash', '-c', "ping", "-c", "1", "8.8.8.8"],
        stdout: "piped",
        stderr: "piped",
    });

    const { code } = await cmd.output();
    return code === 0;
}
