import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { execCmd } from "../system/exec.ts";

export async function postInstall() {
  const customScriptFolder = '/usr/lib/alinix/installer';
  const customScripts = [];

  if (existsSync(customScriptFolder)) {
    const files = [...Deno.readDirSync(customScriptFolder)]
      .filter(f => f.isFile && path.extname(f.name) === ".sh")
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const file of files) {
      const filePath = path.join(customScriptFolder, file.name);
      const content = Deno.readTextFileSync(filePath);
      customScripts.push(content);
      console.log(`✔ Adicionado script: ${file.name}`);
    }

    if (existsSync(path.join(customScriptFolder, 'remove-pkgs.json'))) {
      try {
        const arr = JSON.parse(Deno.readTextFileSync(path.join(customScriptFolder, 'remove-pkgs.json')))

        if (!Array.isArray(arr)) {
          console.log(`${path.join(customScriptFolder, 'remove-pkgs.json')} não é um array valido`);
        } else {
          customScripts.push(
            `apt remove -y ${arr.join(' ')}`
          )
        }
      } catch {
        console.log(`${path.join(customScriptFolder, 'remove-pkgs.json')} não é um JSON valido`);
      }
    }
  }

  await execCmd("chroot", [tmpFolder, "/bin/bash", "-c", `
    set -e
    export DEBIAN_FRONTEND=noninteractive

    echo " Detectando ambiente de virtualização..."
    virt_type=$(systemd-detect-virt || true)

    # Remove pacotes usados apenas na live
    apt-get remove -y casper squashfs-tools arch-install-scripts || true

    ${customScripts.join('\n')}

    # Instala utilitários básicos
    apt-get install -y sudo

    # Se for VirtualBox, instala os drivers de integração
    if [ "$virt_type" = "oracle" ] || [ "$virt_type" = "vbox" ]; then
      echo " Ambiente VirtualBox detectado — instalando virtualbox-guest-utils..."
      apt-get install -y virtualbox-guest-utils virtualbox-guest-x11 || true
      systemctl enable vboxservice || true
    fi

    # Limpeza de pacotes e cache
    apt-get autoremove -y
    apt-get clean

    # Limpeza de lixo e histórico
    rm -rf /tmp/* /root/.*_history /root/.zcompdump* /root/.vim* /root/.ssh /root/.local /opt/alinix-installer /bin/alinix-installer /bin/verify-alinix /opt/verify-alinix 

    rm -rf ${customScriptFolder}
  `]);
}
