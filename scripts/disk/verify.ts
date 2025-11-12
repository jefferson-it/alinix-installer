
export async function isUEFI() {
    try {
        const cmd = new Deno.Command("test", {
            args: ["-d", "/sys/firmware/efi"],
        });
        const { code } = await cmd.output();
        return code === 0;
    } catch {
        return false;
    }
}
