import { allApps } from "../../modules/apps.ts";
import { isUEFI } from "../disk/verify.ts";

export async function defineApps() {
    const script = [
        "#!/bin/bash",
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update",
    ];
    const toRemove = [];
    //  Gera lista de pacotes a instalar via apt
    const desktopTarget = allApps.find(v => v.value === desktop);
    const pkgsApp = allApps
        .filter(({ value }) => apps.includes(value))
        .map(v => v.pkg)
        .filter(Boolean);

    if (desktopTarget) pkgsApp.push(desktopTarget?.pkg)

    //  Google Chrome
    if (apps.includes("google-chrome")) {
        script.push(
            "wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /usr/share/keyrings/google.gpg >/dev/null",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
        );
    }

    //  Visual Studio Code
    if (apps.includes("code")) {
        script.push(
            "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg",
            "install -D -o root -g root -m 644 microsoft.gpg /usr/share/keyrings/microsoft.gpg",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
        );

        toRemove.push('./microsoft.gpg')
    }

    //  WPS Office (instalação manual)
    if (apps.includes("wps-office")) {
        script.push(
            "wget https://wdl1.pcfg.cache.wpscdn.com/wpsdl/wpsoffice/download/linux/11723/wps-office_11.1.0.11723.XA_amd64.deb -O ./wps.deb",
        );

        pkgsApp.push('bsdmainutils libglu1-mesa libxrender1 libxrandr2');

        toRemove.push('./wps.deb')

        pkgsApp.push('zip unzip');
        pkgsApp.push('./wps.deb');
    }

    //  NetBeans (instalação manual)
    if (apps.includes("netbeans")) {
        script.push(
            "wget https://downloads.apache.org/netbeans/netbeans/27/netbeans-27-bin.zip -O ./netbeans.zip",
            "apt-get install unzip -y",
            "unzip ./netbeans.zip -d /opt/",
        );

        toRemove.push('./netbeans.zip')
    }

    if (apps.includes("node")) {
        script.push(
            `runuser -l ${user.username} -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash'`,
            `runuser -l ${user.username} -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 24 && nvm use 24 && nvm alias default 24'`,
            `echo "Node.js instalado. Para usar, execute: source ~/.nvm/nvm.sh"`
        );
    }

    script.push("apt-get update");

    if (desktopTarget) {
        pkgsApp.push(
            "x11-xserver-utils dbus-x11 network-manager mesa-utils",
            "alinix-wallpapers alinix-themes"
        );
    }

    script.push(`echo "Serão baixados o seguintes pacotes: ${pkgsApp.join(', ')}"`)

    for (const pkg of pkgsApp) {
        script.push(`echo "Baixando: ${pkg}"`);
        script.push(`apt-get install -y ${pkg}`);
    }

    if (desktopTarget?.postScript) script.push(desktopTarget.postScript)

    if (toRemove.length > 0) script.push(`rm -rf ${toRemove.join(" \\\n  ")}`)

    //  Retorna o script completo em string
    return script.join("\n");
}
