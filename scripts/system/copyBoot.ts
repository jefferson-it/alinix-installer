import { execCmd } from "./exec.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { isUEFI } from "../disk/verify.ts";

export async function copyBootFiles() {
    const isEFI = await isUEFI();

    console.log("Instalando kernel Linux no sistema...");

    await Deno.mkdir(path.join(tmpFolder, 'boot'), { recursive: true });

    try {
        await execCmd("chroot", [tmpFolder, '/bin/bash', '-c', `
apt update
apt install -y --reinstall linux-image-$(uname -r) || apt install -y --reinstall linux-image-generic
update-initramfs -c -k all
`])
    } catch (error) {
        console.log(`Ocorreu um erro ao instalar o kernel: ${error}`);
    }

    if (isEFI) {
        console.log("Preparando partição EFI...");

        const efiBootDir = `${tmpFolder}/boot/efi/EFI/BOOT`;
        await Deno.mkdir(efiBootDir, { recursive: true });
        console.log(`[ OK ] Estrutura EFI criada: ${efiBootDir}`);

        console.log("[ i ] Arquivos EFI serão criados pelo grub-install");

    } else {
        console.log("Preparando boot BIOS...");

        const bootDestDir = `${tmpFolder}/boot/grub`;
        await Deno.mkdir(bootDestDir, { recursive: true });
        console.log(`[ OK ] Estrutura GRUB criada: ${bootDestDir}`);

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