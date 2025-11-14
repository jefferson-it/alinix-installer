import { execCmd } from "./exec.ts";
import { isUEFI } from "../disk/verify.ts";

export async function copyBootFiles() {
    const isEFI = await isUEFI();

    console.log("Instalando kernel Linux no sistema...");

    let kernelPath = null;
    try {
        const output = await execCmd("find", [
            "/cdrom",
            "/media",
            "-type", "f",
            "-name", "vmlinuz*",
        ]);
        kernelPath = output.split("\n").filter(f => f)[0];
    } catch (_e) {
        console.log("[ i ] Nenhum kernel encontrado na ISO (normal se instalando via apt)");
    }

    let initrdPath = null;
    try {
        const output = await execCmd("find", [
            "/cdrom",
            "/media",
            "-type", "f",
            "-name", "initrd*",
        ]);
        initrdPath = output.split("\n").filter(f => f)[0];
    } catch (_e) {
        console.log("[ i ] Nenhum initrd encontrado na ISO (normal se instalando via apt)");
    }

    if (kernelPath) {
        try {
            const kernelVersion = await execCmd("chroot", [
                tmpFolder,
                "bash",
                "-c",
                "ls /boot/vmlinuz-* | head -1 | sed 's/.*vmlinuz-//'"
            ]);
            const version = kernelVersion.trim();

            if (version) {
                await execCmd("cp", [kernelPath, `${tmpFolder}/boot/vmlinuz-${version}-fallback`]);
                console.log(`[ OK ] Kernel da ISO copiado como fallback`);
            }
        } catch {
            console.log("[ i ] Não foi possível copiar kernel da ISO como fallback");
        }
    }

    if (initrdPath) {
        try {
            const initrdVersion = await execCmd("chroot", [
                tmpFolder,
                "bash",
                "-c",
                "ls /boot/initrd.img-* | head -1 | sed 's/.*initrd.img-//'"
            ]);
            const version = initrdVersion.trim();

            if (version) {
                await execCmd("cp", [initrdPath, `${tmpFolder}/boot/initrd.img-${version}-fallback`]);
                console.log(`[ OK ] Initrd da ISO copiado como fallback`);
            }
        } catch {
            console.log("[ i ] Não foi possível copiar initrd da ISO como fallback");
        }
    }

    if (isEFI) {
        console.log("Preparando partição EFI...");

        // Criar estrutura EFI
        const efiBootDir = `${tmpFolder}/boot/efi/EFI/BOOT`;
        await Deno.mkdir(efiBootDir, { recursive: true });
        console.log(`[ OK ] Estrutura EFI criada: ${efiBootDir}`);

        // Não precisamos copiar arquivos EFI da ISO
        // O grub-install vai criar tudo que precisamos
        console.log("[ i ] Arquivos EFI serão criados pelo grub-install");

    } else {
        console.log("Preparando boot BIOS...");

        // Criar estrutura GRUB
        const bootDestDir = `${tmpFolder}/boot/grub`;
        await Deno.mkdir(bootDestDir, { recursive: true });
        console.log(`[ OK ] Estrutura GRUB criada: ${bootDestDir}`);

        // Não precisamos copiar arquivos da ISO
        // O grub-install vai criar tudo que precisamos
        console.log("[ i ] Arquivos GRUB serão criados pelo grub-install");
    }

    // Verificar instalação do kernel
    console.log("Verificando arquivos de boot instalados...");
    try {
        const bootFiles = await execCmd("chroot", [
            tmpFolder,
            "bash",
            "-c",
            "ls -lh /boot/ | grep -E 'vmlinuz|initrd'"
        ]);
        console.log("Arquivos de boot encontrados:");
        console.log(bootFiles);
    } catch {
        console.warn("Não foi possível listar arquivos de boot");
    }

}