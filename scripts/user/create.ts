import { hashPassword } from "../../modules/users.ts";
import { execCmd } from "../system/exec.ts";

export async function CreateUser() {
    const passwordHash = await hashPassword(user.password);
    await execCmd('chroot', [tmpFolder, '/bin/bash', '-c', `
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
