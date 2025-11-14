import { Checkbox } from "https://deno.land/x/cliffy@v0.25.5/prompt/checkbox.ts";

export const allApps = [
    //  Navegadores
    { name: "Firefox", pkg: 'firefox', value: "firefox" },
    { name: "Google Chrome", pkg: 'google-chrome-stable', value: "google-chrome" },
    { name: "Chromium", pkg: 'chromium', value: "chromium", checked: true },
    //  Terminais
    { name: "Gnome Terminal", pkg: 'gnome-terminal', value: "gnome-terminal" },
    { name: "Ptyxis", pkg: 'ptyxis', value: "ptyxis", checked: true },
    //  Escritório
    { name: "Wps Office", value: "wps-office", checked: true },
    { name: "Libre Office", pkg: 'libreoffice', value: "libre-office" },
    { name: "VsCode", value: "code" },
    { name: "Netbeans", value: "netbeans" },
    // ☕ Java
    { name: "JRE 25", pkg: "openjdk-25-jre", value: "jre-25" },
    { name: "JRE 21", pkg: "openjdk-21-jre", value: "jre-21" },
    { name: "Utilitários JDK 25", pkg: "openjdk-25-jre openjdk-25-jdk", value: "jdk-25" },
    { name: "Utilitários JDK 21", pkg: "openjdk-21-jre openjdk-21-jdk", value: "jdk-21" },
    //  Linguagens de programação
    { name: "Golang", pkg: "golang", value: "golang" },
    { name: "NodeJS", pkg: "", value: "node" },
    { name: "Rust", pkg: "rustc", value: "rust" },
    { name: "PHP", pkg: "php", value: "php" },
    // Ambiente gráfico
    {
        value: 'gnome',
        pkg: 'gnome-shell gnome-session gdm3 nautilus alinix-gnome',
        name: 'GNOME Shell',
        postScript: `
            systemctl enable gdm3
            systemctl set-default graphical.target
        `
    },
    {
        value: 'cinnamon',
        pkg: 'cinnamon nemo lightdm slick-greeter alinix-cinnamon',
        name: 'Cinnamon',
        postScript: `
            systemctl enable lightdm
            systemctl set-default graphical.target
        `
    },
    {
        value: 'kde',
        pkg: 'plasma-desktop sddm dolphin konsole alinix-kde',
        name: 'KDE Plasma',
        postScript: `
            systemctl enable sddm
            systemctl set-default graphical.target
        `
    }
];


export async function choiceApps() {
    const appsOptions = [];

    if (desktop) {
        appsOptions.push(...[
            { name: "Firefox", value: "firefox" },
            { name: "Google Chrome", value: "google-chrome" },
            { name: "Chromium", value: "chromium", checked: true },
            Checkbox.separator("--------"),
            { name: "Gnome Terminal", value: "gnome-terminal" },
            { name: "Ptyxis", value: "ptyxis", checked: true },
            Checkbox.separator("--------"),
            { name: "Wps Office", value: "wps-office" },
            { name: "Libre Office", value: "libre-office" },
            { name: "VsCode", value: "code" },
            { name: "Netbeans", value: "netbeans" },
            Checkbox.separator("--------"),
        ])
    }

    appsOptions.push(...[
        { name: "JRE 25", value: "jre-25" },
        { name: "JRE 21", value: "jre-21" },
        { name: "Utilitários JDK 25", value: "jdk-25" },
        { name: "Utilitários JDK 21", value: "jdk-21" },
        Checkbox.separator("--------"),
        { name: "Golang", value: "golang" },
        { name: "NodeJS", value: "node" },
        { name: "Rust", value: "rust" },
        { name: "PHP", value: "php" },
    ]);

    const appsSelected = await Checkbox.prompt({
        message: "Quais apps deseja que venham pre instalados?",
        options: appsOptions.map(v => ({
            ...v,
            checked: apps.includes(v.value) || v.checked
        }))
    })

    apps = appsSelected;
}