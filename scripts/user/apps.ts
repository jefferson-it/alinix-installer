import { allApps } from "../../modules/apps.ts";

export function defineApps() {
    const script = [
        "#!/bin/bash",
        "export DEBIAN_FRONTEND=noninteractive"
    ];
    const toRemove = [];
    const postScript = [];
    const desktopTarget = allApps.find(v => v.value === desktop);
    const pkgsApp = allApps
        .filter(({ value }) => apps.includes(value))
        .map(v => v.pkg)
        .filter(Boolean);

    if (desktopTarget) pkgsApp.push(desktopTarget?.pkg)


    for (const app of apps) {
        const appTarget = allApps.find(v => v.value === app);
        if (appTarget?.pkg) pkgsApp.push(`${appTarget.noRecommend ? '--no-install-recommends' : ''}${appTarget.pkg}`);

        if (appTarget?.toRemove) toRemove.push(...(Array.isArray(appTarget.toRemove) ? appTarget.toRemove : [appTarget.toRemove]));

        if (appTarget?.script) script.push(...appTarget.script);

        if (appTarget?.postScript) postScript.push(appTarget.postScript);
    }

    if (desktopTarget) {
        pkgsApp.push(
            "x11-xserver-utils dbus-x11 network-manager mesa-utils",
            "alinix-wallpapers alinix-themes"
        );
    }

    script.push("apt-get update");

    script.push(`echo "Serão baixados o seguintes pacotes: ${pkgsApp.join(', ')}"`)

    for (const pkg of pkgsApp) {
        script.push(`echo "Baixando: ${pkg}"`);
        script.push(`apt-get install -y ${pkg} || echo "Falha ao instalar o(s) pacote(s): ${pkg}"`);
    }

    script.push(...postScript);

    if (toRemove.length > 0) script.push(`rm -rf ${toRemove.join(" \\\n  ")}`)

    //  Retorna o script completo em string
    return script.join("\n")
        .replaceAll("$uname", user.username || 'root');
}
