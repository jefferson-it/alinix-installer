import { hashPassword } from "../modules/users.js";
import { execCmd } from "./install.js";

export async function postInstall() {
  const passwordHash = await hashPassword(user.password);
  await execCmd('chroot', [tmpFolder, '/bin/bash', '-c', `
  set -e
  export DEBIAN_FRONTEND=noninteractive

  # Remove pacotes usados apenas na live
  apt-get remove -y casper squashfs-tools arch-install-scripts
  apt-get autoremove -y
  apt-get clean

  # Limpeza de lixo e histórico
  rm -rf /tmp/* /root/.*_history /root/.zcompdump* /root/.vim* /root/.ssh /root/.local

  # Criação do usuário
  useradd -m \\
    -G sudo,adm,cdrom,audio,video \\
    -c "${user.name}" \\
    ${user.username}

  # Define a senha com hash
  usermod -p '${passwordHash}' ${user.username}
  chown -R ${user.username}:${user.username} /home/${user.username}

  rm -rf /opt/alinix-installer /bin/alinix-installer

  USERNAME="alinix"

  # Verifica se o usuário existe
  if id "$USERNAME" &>/dev/null; then
      sudo userdel -r "$USERNAME" 
  fi

`]);

}
