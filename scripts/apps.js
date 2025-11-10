import { allApps } from "../modules/apps.js";

export function defineApps(apps = []) {
    const script = [
        "#!/bin/bash",
        "set -e", // para parar se algum comando falhar
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update",
    ];

    if (desktop) apps.push(desktop);

    // 🔹 Google Chrome
    if (apps.includes("google-chrome")) {
        script.push(
            "wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /usr/share/keyrings/google.gpg >/dev/null",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
        );
    }

    // 🔹 Visual Studio Code
    if (apps.includes("code")) {
        script.push(
            "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg",
            "install -D -o root -g root -m 644 microsoft.gpg /usr/share/keyrings/microsoft.gpg",
            "rm -f microsoft.gpg",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
        );
    }

    // 🔹 WPS Office (instalação manual)
    if (apps.includes("wps-office")) {
        script.push(
            "wget https://wdl1.pcfg.cache.wpscdn.com/wpsdl/wpsoffice/download/linux/11723/wps-office_11.1.0.11723.XA_amd64.deb -O ./wps.deb",
            "apt-get install ./wps.deb -y",
            "rm -f wps.deb"
        );
    }

    // 🔹 NetBeans (instalação manual)
    if (apps.includes("netbeans")) {
        script.push(
            "wget https://downloads.apache.org/netbeans/netbeans/27/netbeans-27-bin.zip -O ./netbeans.zip",
            "apt-get install unzip -y",
            "unzip ./netbeans.zip -d /opt/",
            "rm -f netbeans.zip"
        );
    }

    // 🔹 Atualiza fontes antes da instalação final
    script.push("apt-get update");

    if (desktop) {
        script.push("alinix-wallpapers");
        script.push("alinix-themes");
    }

    // 🔹 Gera lista de pacotes a instalar via apt
    const pkgsApp = allApps
        .filter(({ value }) => apps.includes(value))
        .map(v => v.pkg)
        .filter(Boolean);


    if (pkgsApp.length > 0) {
        script.push(`apt-get install -y \\\n  ${pkgsApp.join(" \\\n  ")}`);
    }

    // 🔹 Retorna o script completo em string
    return script.join("\n");
}
