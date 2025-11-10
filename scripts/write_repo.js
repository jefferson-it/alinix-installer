const sourcesListBase = `
deb $repo questing main universe multiverse
deb-src $repo questing main universe multiverse

deb $repo questing-updates main universe multiverse
deb-src $repo questing-updates main universe multiverse

deb http://security.ubuntu.com/ubuntu/ questing-security main universe multiverse
deb-src http://security.ubuntu.com/ubuntu/ questing-security main universe multiverse
`

export function applyRepo() {
    Deno.writeFileSync(`${tmpFolder}/etc/apt/sources.list`, encode.encode(sourcesListBase.replaceAll('$repo', repos[0])));
    Deno.writeFileSync(`${tmpFolder}/etc/apt/sources.list.d/alinix.list`, encode.encode('deb [arch=amd64, trusted=yes] https://jefferson-it.github.io/alinix-repo/ stable main'));
}