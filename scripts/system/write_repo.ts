const sourcesListBase = `
deb $repo questing main universe multiverse
deb-src $repo questing main universe multiverse

deb $repo questing-updates main universe multiverse
deb-src $repo questing-updates main universe multiverse

deb http://security.ubuntu.com/ubuntu/ questing-security main universe multiverse
deb-src http://security.ubuntu.com/ubuntu/ questing-security main universe multiverse
`

export function applyRepo() {
    Deno.writeTextFileSync(`${tmpFolder}/etc/apt/sources.list`, sourcesListBase.replaceAll('$repo', repos[0]));
    Deno.writeTextFileSync(`${tmpFolder}/etc/apt/sources.list.d/alinix.list`, 'deb [arch=amd64, trusted=yes] https://jefferson-it.github.io/alinix-repo/ stable main');
}