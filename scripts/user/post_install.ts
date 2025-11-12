import { execCmd } from "../system/exec.ts";

export async function postInstall() {
  const tmpFolder = globalThis.tmpFolder ?? "/mnt";

  await execCmd("chroot", [tmpFolder, "/bin/bash", "-c", `
    set -e
    export DEBIAN_FRONTEND=noninteractive

    echo " Detectando ambiente de virtualização..."
    virt_type=$(systemd-detect-virt || true)

    # Remove pacotes usados apenas na live
    apt-get remove -y casper squashfs-tools arch-install-scripts || true

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
  `]);
}
