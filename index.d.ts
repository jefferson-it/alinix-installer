declare global {
    var encode: TextEncoder
    var user: {
        name?: string;
        hostname?: string;
        password?: string;
        username?: string;
    }
    var wifi: {
        ssid: string
        password: string
    }
    var disks: Array<disk>
    var timezone: string | null
    var repos: Array<string>
    var apps: Array<string>
    var desktop: 'gnome' | 'cinnamon' | 'kde' | 'xfce' | null
    var tmpFolder: '/mnt/alinix-temp'
}

export interface disk {
    name: string
    size: number
    bytes: number
    wipe?: boolean
    type: string
    children: part[]
}

export interface part {
    mountPoint?: string | null
    fileSystem: 'ext4' | 'fat32' | 'ntfs' | 'efi' | 'bios' | 'vfat' | 'ext3' | 'ext2' | 'swap'
    erase?: boolean
    partType?: string
    name: string
    type?: string
    UUID?: string,
    size: number | '100%'
}

// Importante: isso torna o arquivo um módulo
export { }