import { defineApps } from "./apps.js";
import { createDiskScript } from "./disk.js";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { writeGrub } from "./grub.js";
import { configNetwork, testNetwork } from "./network.js";
import { postInstall } from "./post_install.js";
import { applyRepo } from "./write_repo.js";
import { exists } from "https://deno.land/std/fs/mod.ts";
import { connectWiFiInteractive } from "../modules/wifi_connect.js";
import { isUEFI } from "../modules/disk.js";
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";

export async function execCmd(cmd, args = [], { capture = true } = {}) {
    console.log(`🚀 Executando: ${cmd} ${args.join(" ")}`);

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
            if (capture) fullOut += chunk;
            if (chunk.trim()) console.log(chunk);
        }
    })();

    const stderrPump = (async () => {
        for await (const chunk of readStream(stderrReader, decoder)) {
            if (capture) fullErr += chunk;
            if (chunk.trim()) console.error(`⚠️ ${chunk}`);
        }
    })();

    const status = await process.status;
    await Promise.all([stdoutPump, stderrPump]);

    if (!status.success) {
        throw new Error(
            `❌ Falha ao executar: ${cmd} ${args.join(" ")}\n--- STDERR ---\n${fullErr}`
        );
    }

    return capture ? fullOut.trim() : true;
}

async function* readStream(reader, decoder) {
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield decoder.decode(value);
    }
}


async function findSquashFS() {
    const possiblePaths = [
        "/cdrom/casper/filesystem.squashfs", // Ubuntu/Debian
        "/mnt/cdrom/casper/filesystem.squashfs",
        // Removido: "/media/*/casper/filesystem.squashfs", (exists() não suporta wildcards)
    ];

    for (const p of possiblePaths) {
        try {
            if (await exists(p)) return p;
        } catch (_e) {
            // Ignora erros de permissão, etc.
        }
    }

    // fallback: busca recursiva (agora usando execCmd)
    try {
        const output = await execCmd("find", [
            "/cdrom",
            "/media", // Adicionado /media à busca
            "-type", "f",
            "-name", "filesystem.squashfs",
        ]);

        const firstResult = output.split("\n")[0];
        if (firstResult) return firstResult;

    } catch (_e) {
        console.error("Falha ao tentar encontrar o squashfs via 'find'");
    }

    return null;
}

async function extractSquashFS() {
    const squashPath = await findSquashFS();
    if (!squashPath) throw new Error("filesystem.squashfs não encontrado!");

    await execCmd("unsquashfs", ["-f", "-d", tmpFolder, squashPath]);
    console.log("Extraído com sucesso em:", tmpFolder);
}

export async function copyBootFiles() {
    const isEFI = await isUEFI();

    // 🔍 Busca o kernel (vmlinuz)
    let kernelPath = null;
    try {
        const output = await execCmd("find", [
            "/cdrom",
            "/media",
            "-type", "f",
            "-name", "vmlinuz*",
        ], { capture: true });
        kernelPath = output.split("\n").filter(f => f)[0];
    } catch (_e) {
        console.error("⚠️ Falha ao buscar vmlinuz");
    }

    Deno.mkdirSync(path.join(tmpFolder, 'boot'), { recursive: true })

    // 🔍 Busca o initrd
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
        console.error("⚠️ Falha ao buscar initrd");
    }

    // 📦 Copia kernel
    if (kernelPath) {
        try {
            await execCmd("cp", [kernelPath, `${tmpFolder}/boot/vmlinuz`]);
            console.log(`✅ Kernel copiado: ${kernelPath} → ${tmpFolder}/boot/vmlinuz`);
        } catch (e) {
            console.error("❌ Erro ao copiar kernel:", e);
        }
    } else {
        console.warn("⚠️ Kernel não encontrado");
    }

    // 📦 Copia initrd
    if (initrdPath) {
        try {
            await execCmd("cp", [initrdPath, `${tmpFolder}/boot/initrd.img`]);
            console.log(`✅ Initrd copiado: ${initrdPath} → ${tmpFolder}/boot/initrd.img`);
        } catch (e) {
            console.error("❌ Erro ao copiar initrd:", e);
        }
    } else {
        console.warn("⚠️ Initrd não encontrado");
    }

    // 📦 Copia arquivos de boot (UEFI ou BIOS)
    if (isEFI) {
        // ===== MODO UEFI =====
        try {
            // Busca diretório EFI em múltiplos locais
            let efiSourceDir = null;
            const possibleLocations = [
                "/cdrom/efi/boot",
                "/cdrom/boot/efi",
                "/cdrom/EFI/BOOT",
                "/media/*/efi/boot",
                "/media/*/boot/efi",
                "/media/*/EFI/BOOT",
            ];

            for (const location of possibleLocations) {
                try {
                    // Usa shell para expandir wildcards
                    const checkResult = await execCmd("sh", ["-c", `ls -d ${location} 2>/dev/null || true`]);
                    const found = checkResult.trim().split("\n").filter(f => f)[0];
                    if (found) {
                        efiSourceDir = found;
                        console.log(`✅ Diretório EFI encontrado: ${efiSourceDir}`);
                        break;
                    }
                } catch (_) {
                    continue;
                }
            }

            if (!efiSourceDir) {
                console.warn("⚠️ Nenhum diretório EFI encontrado");
                return { kernel: kernelPath, initrd: initrdPath, isEFI };
            }

            // Cria diretório de destino
            const efiBootDir = `${tmpFolder}/boot/efi/EFI/BOOT`;
            Deno.mkdirSync(efiBootDir, { recursive: true });
            console.log(`✅ Diretório EFI de destino criado: ${efiBootDir}`);

            // Copia TODOS os arquivos do diretório EFI (usando shell para wildcard)
            await execCmd("sh", ["-c", `cp -v "${efiSourceDir}"/* "${efiBootDir}/" 2>/dev/null || true`]);
            console.log(`✅ Todos os arquivos EFI copiados de ${efiSourceDir}`);

            // Garante que BOOTX64.EFI existe (renomeia se necessário)
            const bootx64Exists = await execCmd("sh", ["-c", `ls "${efiBootDir}"/BOOTX64.EFI 2>/dev/null || true`]);
            if (!bootx64Exists.trim()) {
                // Tenta encontrar qualquer .efi e renomear
                const anyEfi = await execCmd("sh", ["-c", `ls "${efiBootDir}"/*.efi 2>/dev/null | head -n1 || true`]);
                if (anyEfi.trim()) {
                    await execCmd("cp", [anyEfi.trim(), `${efiBootDir}/BOOTX64.EFI`]);
                    console.log(`✅ Renomeado ${anyEfi.trim()} → BOOTX64.EFI`);
                }
            }

        } catch (e) {
            console.error("❌ Erro ao copiar arquivos EFI:", e);
        }

    } else {
        // ===== MODO BIOS =====
        try {
            // Busca diretório de boot BIOS em múltiplos locais
            let biosBootDir = null;
            const possibleLocations = [
                "/cdrom/boot/grub",
                "/cdrom/isolinux",
                "/cdrom/syslinux",
                "/media/*/boot/grub",
                "/media/*/isolinux",
                "/media/*/syslinux",
            ];

            for (const location of possibleLocations) {
                try {
                    const checkResult = await execCmd("sh", ["-c", `ls -d ${location} 2>/dev/null || true`]);
                    const found = checkResult.trim().split("\n").filter(f => f)[0];
                    if (found) {
                        biosBootDir = found;
                        console.log(`✅ Diretório BIOS boot encontrado: ${biosBootDir}`);
                        break;
                    }
                } catch (_) {
                    continue;
                }
            }

            if (!biosBootDir) {
                console.warn("⚠️ Nenhum diretório de boot BIOS encontrado");
                return { kernel: kernelPath, initrd: initrdPath, isEFI };
            }

            // Cria diretório de destino
            const bootDestDir = `${tmpFolder}/boot/grub`;
            await Deno.mkdir(bootDestDir, { recursive: true });

            // Copia TODOS os arquivos de boot BIOS
            await execCmd("sh", ["-c", `cp -rv "${biosBootDir}"/* "${bootDestDir}/" 2>/dev/null || true`]);
            console.log(`✅ Todos os arquivos de boot BIOS copiados de ${biosBootDir}`);

        } catch (e) {
            console.error("❌ Erro ao copiar arquivos de boot BIOS:", e);
        }
    }

    return {
        kernel: kernelPath,
        initrd: initrdPath,
        isEFI
    };
}

export default async function InstallProcess() {
    // 🧱 Garante que o diretório temporário existe
    Deno.mkdirSync(tmpFolder, { recursive: true });

    console.log("📦 Preparando discos...");
    await createDiskScript();

    // -----------------------------------------------------------------
    // CORREÇÃO CRÍTICA DE ORDEM: Montar partições PRIMEIRO
    // -----------------------------------------------------------------
    console.log("💽 Montando partições...");
    await execCmd("./disk.sh"); // Monta as partições (ex: /dev/sda1) em tmpFolder

    console.log("📂 Extraindo sistema base...");
    await extractSquashFS(); // Extrai o sistema PARA DENTRO das partições montadas

    await copyBootFiles();


    // -----------------------------------------------------------------

    console.log("🌐 Configurando rede...");
    await configNetwork();

    console.log("📦 Definindo aplicativos...");
    const scriptApp = await defineApps();

    Deno.writeFileSync(
        `${tmpFolder}/root/apps.sh`,
        encode.encode(scriptApp),
        { mode: 0o755 },
    );

    console.log("📦 Aplicando repositórios...");

    console.log("Mounting virtual filesystems...");
    const procPath = path.join(tmpFolder, "proc");
    const sysPath = path.join(tmpFolder, "sys");
    const devPath = path.join(tmpFolder, "dev");
    const devPtsPath = path.join(tmpFolder, "dev/pts");
    const runPath = path.join(tmpFolder, "run");

    // Cria diretórios
    Deno.mkdirSync(procPath, { recursive: true });
    Deno.mkdirSync(sysPath, { recursive: true });
    Deno.mkdirSync(devPath, { recursive: true });
    Deno.mkdirSync(devPtsPath, { recursive: true });
    Deno.mkdirSync(runPath, { recursive: true });

    // Montagens básicas
    await execCmd("mount", ["-t", "proc", "proc", procPath]);
    await execCmd("mount", ["--bind", "/sys", sysPath]);
    await execCmd("mount", ["--bind", "/dev", devPath]);
    await execCmd("mount", ["--bind", "/dev/pts", devPtsPath]);
    await execCmd("mount", ["--bind", "/run", runPath]);

    // Montagem EFI se necessário
    if (await isUEFI()) {
        await execCmd("mount", ["--bind", "/sys/firmware/efi", `${tmpFolder}/sys/firmware/efi`]);
        await execCmd("mount", ["-t", "efivarfs", "efivarfs", `${tmpFolder}/sys/firmware/efi/efivars`]);
    }

    await execCmd("mkdir", ["-p", `${tmpFolder}/boot/efi/EFI/BOOT`]);
    await execCmd("mkdir", ["-p", `${tmpFolder}/boot/efi/EFI/Alinix`]);


    console.log("✅ Sistemas de arquivos virtuais montados para o chroot.");

    // -----------------------------------------------------------------
    // CORREÇÃO DE REDE (DNS): Copia resolv.conf para o chroot
    // -----------------------------------------------------------------
    console.log("Resolvendo rede para o chroot...");

    await execCmd("rm", [path.join(tmpFolder, "etc/resolv.conf")]);

    // 2. Copia o arquivo real
    await execCmd("cp", [
        "-L", // Segue o atalho do *host*
        "/etc/resolv.conf",
        path.join(tmpFolder, "etc/resolv.conf")
    ]);

    if (!await testNetwork()) {
        await connectWiFiInteractive();
    }
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // CORREÇÃO CRÍTICA FSTAB: Executar do host, apontar para tmpFolder
    // -----------------------------------------------------------------
    console.log("🧾 Gerando fstab...");
    const fstabPath = path.join(tmpFolder, "etc/fstab"); // Caminho correto
    try {
        await execCmd("bash", [
            "-c",
            `genfstab -U ${tmpFolder} >> ${fstabPath}`
        ]);
    } catch {
        console.warn("⚠️ genfstab falhou. Tentando método blkid alternativo...");
        // CORREÇÃO: Redireciona para fstabPath e lógica de filtro melhorada
        await execCmd("bash", ["-c", `
                blkid | while read -r line; do
                    dev=$(echo "$line" | cut -d: -f1)
                    uuid=$(echo "$line" | sed -n 's/.*UUID="\\([^"]*\\)".*/\\1/p')
                    type=$(echo "$line" | sed -n 's/.*TYPE="\\([^"]*\\)".*/\\1/p')
                    mountpoint=$(findmnt -no TARGET "$dev" 2>/dev/null)
                    
                    # Gera entrada apenas para pontos de montagem DENTRO do tmpFolder
                    if [[ "$mountpoint" == "${tmpFolder}"* ]]; then
                        # Remove o prefixo tmpFolder do ponto de montagem
                        guest_mountpoint=$(echo "$mountpoint" | sed "s|^${tmpFolder}||")
                        [ -z "$guest_mountpoint" ] && guest_mountpoint="/" # Trata o caso da raiz
                        [ -n "$uuid" ] && [ -n "$type" ] && echo "UUID=$uuid $guest_mountpoint $type defaults 0 1"
                    fi
                done >> ${fstabPath}
            `]);
    }

    try {
        console.log("⚙️ Instalando o GRUB...");
        await writeGrub();

    } catch (error) {
        console.log('⚠️ Ocorreu um erro ao instalar o grub:', error);
        console.log('🔄 Tentando boot direto via EFI (fallback)...');

        // 🧠 Encontra o disco que contém a partição EFI
        const efiDisk = disks.find(d =>
            d.children.some(p => p.mountPoint === "/boot/efi")
        );

        if (!efiDisk) {
            throw new Error("❌ Nenhum disco com partição EFI montada foi encontrado.");
        }

        // 🧩 Encontra a partição EFI dentro desse disco
        const efiPart = efiDisk.children.find(p => p.mountPoint === "/boot/efi");

        if (!efiPart) {
            throw new Error("❌ Partição EFI não encontrada neste disco.");
        }

        // 🔍 Extrai o número da partição (ex: de /dev/sda1 → 1)
        const partNum = efiPart.name.match(/[0-9]+$/)?.[0];
        if (!partNum) {
            throw new Error(`❌ Não foi possível extrair número da partição de ${efiPart.name}`);
        }

        // 🧩 Encontra a partição root (/) para passar como root=...
        const rootPart = disks
            .flatMap(d => d.children)
            .find(p => p.mountPoint === "/");

        if (!rootPart) {
            throw new Error("❌ Partição raiz (/) não encontrada.");
        }

        console.log(`📁 Criando diretório EFI/Alinix...`);
        const efiAlinixPath = `${tmpFolder}/boot/efi/EFI/Alinix`;
        Deno.mkdirSync(efiAlinixPath, { recursive: true });

        // 🔑 CRÍTICO: Copiar kernel e initrd para a partição EFI
        console.log(`📦 Copiando vmlinuz para a partição EFI...`);
        await execCmd("cp", [
            `${tmpFolder}/boot/vmlinuz`,
            `${efiAlinixPath}/vmlinuz`
        ]);

        console.log(`📦 Copiando initrd.img para a partição EFI...`);
        await execCmd("cp", [
            `${tmpFolder}/boot/initrd.img`,
            `${efiAlinixPath}/initrd.img`
        ]);

        // Verificar se os arquivos foram copiados
        const files = Array.from(Deno.readDirSync(efiAlinixPath)).map(f => f.name);
        console.log(`✓ Arquivos em ${efiAlinixPath}:`, files);

        if (!files.includes('vmlinuz') || !files.includes('initrd.img')) {
            throw new Error("❌ Falha ao copiar arquivos de boot para a partição EFI");
        }

        // 🔧 Obter UUID da partição root
        const rootUuidOutput = await execCmd('blkid', ['-s', 'UUID', '-o', 'value', toDev(rootPart.name)], { capture: true });
        const rootUuid = rootUuidOutput.trim();

        console.log(`🔧 Criando entrada EFI para boot direto (${efiDisk.name}, partição ${partNum})...`);

        // Criar entrada EFI com caminhos corretos
        await execCmd("efibootmgr", [
            "--create",
            "--disk", toDev(efiDisk.name),
            "--part", partNum,
            "--label", "Alinix",
            "--loader", "\\EFI\\Alinix\\vmlinuz",
            "--unicode", `root=UUID=${rootUuid} ro quiet splash initrd=\\EFI\\Alinix\\initrd.img`
        ]);

        console.log("✅ Entrada EFI criada com sucesso (boot direto)");
        console.log("⚠️ Nota: Este é um fallback. O ideal é corrigir a instalação do GRUB.");
    }


    console.log("✅ Entrada EFI criada com sucesso (boot direto sem GRUB)");

    // -----------------------------------------------------------------

    console.log("📦 Instalando aplicativos dentro do chroot...");

    await applyRepo()

    await execCmd("chroot", [
        tmpFolder,
        "/bin/bash",
        "-c",
        `/root/apps.sh`,
    ]);

    // Lembrar de definir o teclado ABNT-2
    if (globalThis.timezone) {
        await execCmd("chroot", [tmpFolder, "bash", "-c", `
    ln -sf /usr/share/zoneinfo/${globalThis.timezone} /etc/localtime
    echo "${globalThis.timezone}" > /etc/timezone
  `]);
    }

    await execCmd("chroot", [tmpFolder, "bash", "-c", `
        echo 'KEYMAP=br-abnt2' > /etc/vconsole.conf
        localectl set-keymap br-abnt2 || loadkeys br-abnt2 || true
    `]);

    console.log("🧹 Limpando e configurando pós-instalação...");
    await postInstall();

    console.log("📤 Desmontando sistema...");
    try {
        await execCmd("umount", ["-R", tmpFolder]);
    } catch {
        console.warn("⚠️ Aviso: não foi possível desmontar completely o tmpFolder");
    }

    console.log(`
    ===========================================
    ✅ Instalação concluída com sucesso!
    ===========================================
    `);

    const useFun = await Select.prompt({
        message: "Continuar testando?",
        options: [
            { value: 'reboot', name: 'Reiniciar agora' },
            { value: 'ok', name: 'Continuar testando' },
        ]
    })

    if (useFun === 'reboot') await execCmd("reboot");
}