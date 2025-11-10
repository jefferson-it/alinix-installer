export async function writeGrub() {
    const disks = globalThis.disks ?? [];
    const tmpFolder = globalThis.tmpFolder ?? "/mnt";

    // Template correto
    const template = `# GRUB Configuration
set default=0
set timeout=5
set gfxmode=auto
terminal_output gfxterm

insmod gzio
insmod part_gpt
insmod part_msdos
insmod ext2
insmod fat
insmod efi_gop
insmod efi_uga

search --no-floppy --set=root --fs-uuid <UUID-DO-ROOT>

menuentry "Alinix" {
    linux /boot/vmlinuz root=UUID=<UUID-DO-ROOT> ro quiet splash
    initrd /boot/initrd.img
}

menuentry "Alinix (modo de recuperação)" {
    linux /boot/vmlinuz root=UUID=<UUID-DO-ROOT> ro single
    initrd /boot/initrd.img
}
`;

    const rootPartition = disks.flatMap(d => d.children)
        .find(p => p.mountPoint === "/")?.name;
    if (!rootPartition)
        throw new Error("Nenhuma partição raiz ('/') encontrada.");

    const rootDevice = toDev(rootPartition);
    const diskDevice = rootDevice.replace(/p?[0-9]+$/, '');

    console.log(`📀 Disco detectado: ${diskDevice}`);
    console.log(`📁 Partição raiz: ${rootDevice}`);

    const stdout = await execCmd('blkid', ['-s', 'UUID', '-o', 'value', rootDevice], { capture: true });
    const rootUuid = stdout.trim();

    const cfg = template.replaceAll('<UUID-DO-ROOT>', rootUuid);

    const isEFI = await isUEFI();

    if (isEFI) {
        const efiPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/boot/efi")?.name;

        if (!efiPartition) {
            throw new Error("Partição EFI não encontrada com mountPoint '/boot/efi'.");
        }

        const efiDevice = toDev(efiPartition);
        console.log(`💾 Partição EFI detectada: ${efiDevice}`);

        // Verificar montagem
        try {
            await execCmd('mountpoint', ['-q', `${tmpFolder}/boot/efi`]);
            console.log(`✓ ${tmpFolder}/boot/efi está montado`);
        } catch {
            throw new Error(`${tmpFolder}/boot/efi não está montado.`);
        }

        // Criar diretórios necessários
        Deno.mkdirSync(`${tmpFolder}/boot/grub`, { recursive: true });
        Deno.mkdirSync(`${tmpFolder}/boot/efi/EFI/Alinix`, { recursive: true });

        // Copiar arquivos de boot ANTES
        await copyBootFiles();

        // Escrever grub.cfg no local CORRETO para UEFI
        const grubCfgPath = `${tmpFolder}/boot/grub/grub.cfg`;
        Deno.writeTextFileSync(grubCfgPath, cfg, { mode: 0o644 });
        console.log(`✓ grub.cfg criado em ${grubCfgPath}`);

        // Instalar GRUB
        console.log("🔧 Instalando GRUB para UEFI...");
        await execCmd('chroot', [
            tmpFolder,
            'grub-install',
            '--target=x86_64-efi',
            '--efi-directory=/boot/efi',
            '--boot-directory=/boot',
            '--bootloader-id=Alinix',
            '--recheck'
        ]);

        // CRÍTICO: Gerar grub.cfg automaticamente
        console.log("🔧 Gerando grub.cfg...");
        await execCmd('chroot', [
            tmpFolder,
            'grub-mkconfig',
            '-o',
            '/boot/grub/grub.cfg'
        ]);

        await execCmd('cp', [
            grubCfgPath,
            `${tmpFolder}/boot/efi/EFI/Alinix/grub.cfg`
        ]);

        console.log("✅ GRUB instalado com sucesso no modo UEFI");

    } else {
        // BIOS Legacy
        Deno.mkdirSync(`${tmpFolder}/boot/grub`, { recursive: true });
        Deno.writeTextFileSync(`${tmpFolder}/boot/grub/grub.cfg`, cfg, { mode: 0o644 });

        await copyBootFiles();

        console.log("🔧 Instalando GRUB para BIOS Legacy...");
        await execCmd('chroot', [
            tmpFolder,
            'grub-install',
            '--target=i386-pc',
            '--boot-directory=/boot',
            '--recheck',
            diskDevice
        ]);

        // Gerar grub.cfg
        await execCmd('chroot', [
            tmpFolder,
            'grub-mkconfig',
            '-o',
            '/boot/grub/grub.cfg'
        ]);

        console.log("✅ GRUB instalado com sucesso no modo BIOS");
    }
}