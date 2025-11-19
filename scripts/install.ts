import { defineApps } from "./user/apps.ts";
import { writeGrub } from "./system/grub.ts";
import { postInstall } from "./user/post_install.ts";
import { applyRepo } from "./system/write_repo.ts";
import { connectWiFiInChroot, connectWiFiInteractive } from "../modules/wifi_connect.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { execCmd } from "./system/exec.ts";
import { createDiskScript } from "./disk/createDisk.ts";
import { testNetwork } from "./network.ts";
import { CreateUser } from "./user/create.ts";
import { mountDevices } from "./system/mount.ts";
import { genFstab } from "./system/fstab.ts";
import { extractSquashFS } from "./system/extractSquashFS.ts";
import { copyBootFiles } from "./system/copyBoot.ts";

export default async function InstallProcess() {
    Deno.mkdirSync(tmpFolder, { recursive: true });

    console.log("[ APT ] Preparando discos...");
    await createDiskScript();
    console.log("[ O ] Montando partições...");

    await execCmd("./disk.sh");
    await extractSquashFS();

    await CreateUser();
    await mountDevices();

    console.log("> Configurando rede...");

    if (!await testNetwork()) {
        await connectWiFiInteractive();
    }

    if (wifi) {
        await connectWiFiInChroot(wifi.ssid, wifi.password)
    }


    try {
        console.log("> Copiando DNS do host para o chroot...");
        Deno.copyFileSync("/etc/resolv.conf", `${tmpFolder}/etc/resolv.conf`);
    } catch (err) {
        console.error("Erro ao copiar /etc/resolv.conf:", err);
        // Lidar com o erro, talvez o instalador não possa continuar
        return;
    }

    await execCmd("chroot", [
        tmpFolder, "bash", "-c",
        "export DEBIAN_FRONTEND=noninteractive; apt update; apt install -y network-manager"
    ]);

    await execCmd("chroot", [
        tmpFolder, "bash", "-c",
        "systemctl enable NetworkManager.service; systemctl enable systemd-resolved.service"
    ]);

    const netplanConfig = `
# Configuração de rede padrão para o sistema instalado
network:
  version: 2
  renderer: NetworkManager
`;
    Deno.mkdirSync(`${tmpFolder}/etc/netplan`, { recursive: true });
    Deno.writeTextFileSync(`${tmpFolder}/etc/netplan/01-config.yaml`, netplanConfig);

    await genFstab()

    if (globalThis.timezone) {
        await execCmd("chroot", [tmpFolder, "bash", "-c", `
    ln -sf /usr/share/zoneinfo/${globalThis.timezone} /etc/localtime
    echo "${globalThis.timezone}" > /etc/timezone
  `]);
    }


    console.log("[ APT ] Definindo aplicativos...");
    const scriptApp = defineApps();
    Deno.writeTextFileSync(`${tmpFolder}/root/apps.sh`, scriptApp, { mode: 0o755 });

    console.log("[ APT ] Aplicando repositórios...");
    applyRepo()
    console.log("[ APT ] Instalando aplicativos dentro do disco...");

    await copyBootFiles();

    try {
        console.log("[ CFG ] Instalando o GRUB...");
        await writeGrub();
    } catch (error) {
        console.log('[ ! ] Ocorreu um erro ao instalar o grub:', error);
    }

    await execCmd("chroot", [
        tmpFolder,
        "/bin/bash",
        "-c",
        `/root/apps.sh`,
    ]);

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

    if (Deno.args[0] == "--json") {
        Deno.exit(0);
    }

    const useFun = await Select.prompt({
        message: "Continuar testando?",
        options: [
            { value: 'reboot', name: 'Reiniciar agora' },
            { value: 'ok', name: 'Continuar testando' },
        ]
    })

    if (useFun === 'reboot') await execCmd("reboot");
}