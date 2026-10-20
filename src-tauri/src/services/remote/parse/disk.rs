// `disk` section: `df -P -k`. Pseudo filesystems are dropped here too, since
// busybox df can't exclude them itself.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub mount: String,
    /// The df "Filesystem" column (device or source).
    pub fs: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub avail_bytes: u64,
}

const PSEUDO: [&str; 9] = [
    "tmpfs", "devtmpfs", "overlay", "squashfs", "shm", "udev", "none", "cgroup", "proc",
];

/// One entry per device: bind mounts (common in containers) repeat the same
/// filesystem under several paths, and only the first is kept.
pub fn parse_disks(body: Option<&str>) -> Vec<Disk> {
    let mut seen = std::collections::HashSet::new();
    body.unwrap_or("")
        .lines()
        .skip_while(|l| l.starts_with("Filesystem"))
        .filter_map(|l| {
            let cols: Vec<&str> = l.split_whitespace().collect();
            if cols.len() < 6 || PSEUDO.contains(&cols[0]) {
                return None;
            }
            let kb = |i: usize| cols[i].parse::<u64>().ok().map(|v| v * 1024);
            let disk = Disk {
                fs: cols[0].to_string(),
                total_bytes: kb(1)?,
                used_bytes: kb(2)?,
                avail_bytes: kb(3)?,
                // A mount point with spaces spans the remaining columns.
                mount: cols[5..].join(" "),
            };
            (disk.total_bytes > 0 && !disk.mount.starts_with("/snap/")).then_some(disk)
        })
        .filter(|d| seen.insert(d.fs.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_pseudo_and_empty_filesystems() {
        let d = parse_disks(Some(
            "Filesystem     1024-blocks     Used Available Capacity Mounted on\n\
             overlay           98496756 18549900  74897360      20% /\n\
             tmpfs                65536        0     65536       0% /dev\n\
             /dev/vda1         98496756 18549900  74897360      20% /etc/hosts\n\
             /dev/vda1         98496756 18549900  74897360      20% /etc/resolv.conf\n\
             /dev/loop3           65536    65536         0     100% /snap/core/1\n\
             /dev/sdb1             1000      960        40      96% /mnt/My Data\n\
             /dev/sdc1                0        0         0       -  /empty\n\
             garbage line\n",
        ));
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].mount, "/etc/hosts");
        assert_eq!(d[0].used_bytes, 18_549_900 * 1024);
        assert_eq!(d[1].mount, "/mnt/My Data");
    }
}
