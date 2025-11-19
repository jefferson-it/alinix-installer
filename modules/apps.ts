import { Checkbox } from "https://deno.land/x/cliffy@v0.25.5/prompt/checkbox.ts";
import { execCmd } from "../scripts/system/exec.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { choiceDesktop } from "./desktop.ts";
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";

interface appOption {
    name: string
    value: string
    pkg?: string
    checked?: boolean
    script?: string[]
    postScript?: string,
    noRecommend?: boolean
    needDesktop?: boolean,
    toRemove?: string | string[]
    category: string
}

export const allApps: appOption[] = [
    // Navegadores
    {
        name: "Firefox",
        value: "firefox",
        needDesktop: true,
        category: "Navegadores",
        script: [
            "add-apt-repository -y ppa:mozillateam/ppa",
        ],
        pkg: 'firefox',
    },
    {
        name: "Google Chrome",
        value: "google-chrome",
        script: [
            "wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /usr/share/keyrings/google.gpg >/dev/null",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list',

        ],
        pkg: 'google-chrome-stable',
        needDesktop: true,
        category: "Navegadores"
    },
    {
        name: "Chromium",
        value: "chromium",
        checked: true,
        script: [
            "wget http://ftp.debian.org/debian/pool/main/c/chromium/chromium-common_142.0.7444.162-1_amd64.deb -o ./chromium-common.deb",
        ],
        pkg: './chromium-common.deb',
        toRemove: 'chromium-common.deb',
        needDesktop: true,
        category: "Navegadores"
    },
    // Terminais
    {
        name: "Gnome Terminal",
        pkg: 'gnome-terminal',
        value: "gnome-terminal",
        needDesktop: true,
        category: "Terminais"
    },
    {
        name: "Ptyxis",
        pkg: 'ptyxis',
        value: "ptyxis",
        checked: true,
        needDesktop: true,
        category: "Terminais"
    },
    // Escritório
    {
        name: "Wps Office",
        value: "wps-office",
        pkg: 'bsdmainutils libglu1-mesa libxrender1 libxrandr2 zip unzip ./wps.deb',
        toRemove: './wps.deb',
        script: ["wget https://wdl1.pcfg.cache.wpscdn.com/wpsdl/wpsoffice/download/linux/11723/wps-office_11.1.0.11723.XA_amd64.deb -O ./wps.deb"],
        needDesktop: true,
        category: "Escritório"
    },
    {
        name: "Libre Office",
        pkg: 'libreoffice',
        value: "libre-office",
        needDesktop: true,
        category: "Escritório"
    },
    {
        name: "VsCode",
        value: "code",
        toRemove: ['./microsoft.gpg'],
        script: [
            "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg",
            "install -D -o root -g root -m 644 microsoft.gpg /usr/share/keyrings/microsoft.gpg",
            'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
        ],
        needDesktop: true,
        category: "Desenvolvimento"
    },
    {
        name: "Netbeans",
        script: [
            "wget https://downloads.apache.org/netbeans/netbeans/27/netbeans-27-bin.zip -O ./netbeans.zip",
            "apt-get install unzip -y",
            "unzip ./netbeans.zip -d /opt/",
            `
            cat <<EOF > /usr/share/applications/netbeans.desktop
[Desktop Entry]
Name=NetBeans IDE 27
Comment=Apache NetBeans Integrated Development Environment
Exec=/opt/netbeans/bin/netbeans
Icon=/opt/netbeans/nb/netbeans.png
Terminal=false
Type=Application
Categories=Development;IDE;
StartupNotify=true
EOF`
        ],
        toRemove: 'netbeans.zip',
        value: "netbeans",
        needDesktop: true,
        category: "Desenvolvimento"
    },
    // Java
    {
        name: "Utilitários JDK 25",
        pkg: "openjdk-25-jre openjdk-25-jdk",
        value: "jdk-25",
        category: "Linguagens de programação"
    },
    {
        name: "Utilitários JDK 21",
        pkg: "openjdk-21-jre openjdk-21-jdk",
        value: "jdk-21",
        category: "Linguagens de programação"
    },
    // Linguagens de programação
    {
        name: "Golang",
        pkg: "golang",
        value: "golang",
        category: "Linguagens de programação"
    },
    {
        name: "NodeJS",
        script: [
            `runuser -l $uname -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash'`,
            `runuser -l $uname -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 24 && nvm use 24 && nvm alias default 24'`,
            `echo "Node.js instalado. Para usar, execute: source ~/.nvm/nvm.sh"`
        ],
        value: "node",
        category: "Linguagens de programação"
    },
    {
        name: "Rust",
        pkg: "rustc",
        value: "rust",
        category: "Linguagens de programação"
    },
    {
        name: "PHP",
        pkg: "php",
        value: "php",
        category: "Linguagens de programação"
    },
    // Kernel
    {
        name: 'Kernel Liquorix',
        pkg: 'linux-image-liquorix-amd64 linux-headers-liquorix-amd64',
        value: 'liquorix-kernel',
        category: "Kernel",
        script: [
            "curl -s 'https://liquorix.net/install-liquorix.sh' | bash"
        ]
    },
    // Ambientes gráficos
    {
        value: 'gnome',
        pkg: 'gnome-shell gnome-session gdm3 nautilus alinix-gnome',
        name: 'GNOME Shell',
        postScript: `
            systemctl enable gdm3
            systemctl set-default graphical.target
        `,
        noRecommend: true,
        category: "Ambientes gráficos"
    },
    {
        value: 'cinnamon',
        pkg: 'cinnamon cinnamon-session nemo lightdm slick-greeter alinix-cinnamon',
        name: 'Cinnamon',
        postScript: `
            systemctl enable lightdm
            systemctl set-default graphical.target

            rm -rf /usr/share/xsessions/lightdm-xsession.desktop

            mkdir -p /etc/lightdm/lightdm.conf.d
            cat > /etc/lightdm/lightdm.conf.d/50-cinnamon.conf << EOF
[Seat:*]
user-session=cinnamon
EOF
        `,
        noRecommend: true,
        category: "Ambientes gráficos"
    }
];


export async function choiceApps(preMsg?: string) {
    apps = apps.length ? apps : allApps.filter(v => v.checked).map(v => v.value);
    let appDraftList: appOption[] = allApps.filter(v => v.category !== "Ambientes gráficos");
    const categories = Array.from(new Set(appDraftList.map(v => v.category)));

    await execCmd('clear');

    if (preMsg) console.log(preMsg);

    if (appDraftList.length) {
        console.log(`Apps já selecionados:\n${appDraftList.filter(v => v.checked).map((v, i) => `${i + 1}. ${v.name} (${v.category})`).join(';\n')}`);
    }

    const categorySelected = await Select.prompt({
        message: "Selecione a categoria de aplicativo?",
        options: [
            ...categories.map(v => ({ name: v, value: v })),
            { name: "( <- Voltar", value: "back" },
            { name: "-> ) Finalizar seleção de apps", value: "finish" }
        ]
    })

    if (categorySelected === "back") return await choiceDesktop();

    else if (categorySelected === "finish") {
        if (desktop) {
            const selectedBrowsers = appDraftList
                .filter(app => app.category === "Navegadores" && app.checked)

            if (selectedBrowsers.length === 0) {
                return await choiceApps("[ i ] Você precisa selecionar ao menos 1 navegador");
            }
        }

        apps = Array.from(new Set(appDraftList.filter(({ checked }) => checked).map(v => v.value)));

        return;
    }

    await choice(categorySelected);

    return await choiceApps();

    async function choice(categoryTarget: string) {
        const appInCategory = appDraftList.filter(v => v.category === categoryTarget).filter(({ needDesktop, category }) => (desktop ? true : !needDesktop) && category === categoryTarget)
        const appsSelected = await Checkbox.prompt({
            message: "Quais apps deseja que venham pre instalados?",
            options: appInCategory.map(({ checked, value, name }) => ({
                name,
                value,
                checked: appDraftList.find(v => v.value === value)?.checked || checked
            }))
        });

        const newAppsSelected = appInCategory.map(value => {
            const item = value;

            if (categoryTarget === item.category) {
                item.checked = appsSelected.includes(item.value);
            }

            return item;
        })

        appDraftList = newAppsSelected;

        const confirmed = await Confirm.prompt({
            message: `Você selecionou: ${appsSelected.join(", ")}. Confirmar?`,
        });


        if (!confirmed) return await choice(categoryTarget);
    }
}