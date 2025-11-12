import { defineApps } from "./user/apps.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { writeGrub } from "./system/grub.ts";
import { postInstall } from "./user/post_install.ts";
import { applyRepo } from "./system/write_repo.ts";
import { connectWiFiInteractive } from "../modules/wifi_connect.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { execCmd } from "./system/exec.ts";
import { createDiskScript } from "./disk/createDisk.ts";
import { chrootTestNetwork, testNetwork } from "./network.ts";
import { CreateUser } from "./user/create.ts";
import { mountDevices } from "./system/mount.ts";
import { genFstab } from "./system/fstab.ts";
import { extractSquashFS } from "./system/extractSquashFS.ts";
import { copyBootFiles } from "./system/copyBoot.ts";
import { isUEFI } from "./disk/verify.ts";
import { toDev } from "../modules/disk/replace.ts";

export default async function InstallProcess() {
    Deno.mkdirSync(tmpFolder, { recursive: true });

    console.log("[ APT ] Preparando discos...");
    await createDiskScript();
    console.log("[ O ] Montando partições...");

    await execCmd("./disk.sh");
    await extractSquashFS();

    if (await isUEFI()) {
        console.log("[VERIFICAÇÃO] Garantindo que a partição EFI está montada...");
        const efiPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/boot/efi");

        if (efiPartition) {
            const efiMountPoint = path.join(tmpFolder, "boot/efi");

            try {
                await execCmd("mkdir", ["-p", efiMountPoint]);
                await execCmd("mount", [toDev(efiPartition.name), efiMountPoint]);
                console.log(`[ OK ] Partição ${toDev(efiPartition.name)} montada em ${efiMountPoint}`);
            } catch (e) {
                console.log(`[ INFO ] Partição EFI já estava montada ou ocorreu um erro: ${e}`);
            }
        } else {
            console.log("⚠️  Nenhuma partição /boot/efi definida nos discos.");
        }
    }

    await CreateUser();
    await mountDevices()

    console.log("Resolvendo rede para o chroot...");
    await execCmd("rm", [path.join(tmpFolder, "etc/resolv.conf")]);
    console.log("> Configurando rede...");

    await execCmd("chroot", [
        tmpFolder,
        "bash",
        "-c",
        `
        rm -f /etc/resolv.conf
        mkdir -p /run/systemd/resolve
        touch /run/systemd/resolve/stub-resolv.conf
        ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
        `
    ]);


    if (!await chrootTestNetwork() || !await testNetwork()) {
        await connectWiFiInteractive();
    }

    await genFstab()

    if (globalThis.timezone) {
        await execCmd("chroot", [tmpFolder, "bash", "-c", `
    ln -sf /usr/share/zoneinfo/${globalThis.timezone} /etc/localtime
    echo "${globalThis.timezone}" > /etc/timezone
  `]);
    }


    console.log("[ APT ] Definindo aplicativos...");
    const scriptApp = await defineApps();
    Deno.writeTextFileSync(`${tmpFolder}/root/apps.sh`, scriptApp, { mode: 0o755 });

    console.log("[ APT ] Aplicando repositórios...");
    applyRepo()
    console.log("[ APT ] Instalando aplicativos dentro do disco...");

    await execCmd("chroot", [
        tmpFolder,
        "/bin/bash",
        "-c",
        `/root/apps.sh`,
    ]);

    await copyBootFiles();


    try {
        console.log("[ CFG ] Instalando o GRUB...");
        await writeGrub();

    } catch (error) {
        console.log('[ ! ] Ocorreu um erro ao instalar o grub:', error);

    }

    console.log("Limpando e configurando pós-instalação...");
    await postInstall();

    console.log("Configurando idioma e layout de teclado para o sistema...");
    await execCmd("chroot", [tmpFolder, "bash", "-c", `
        set -e
        locale-gen pt_BR.UTF-8
        update-locale LANG=pt_BR.UTF-8
        localectl set-keymap br-abnt2 || loadkeys br-abnt2 || true
    `]);
    console.log("Idioma e teclado configurados para Português do Brasil (ABNT2).");

    console.log("Desmontando sistema...");
    try {
        await execCmd("sync");
        await execCmd("umount", ["-R", tmpFolder]).catch(() => { });
    } catch {
        // 
    }

    console.log(`
    ===========================================
    [ OK ]  Instalação concluída com sucesso!
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