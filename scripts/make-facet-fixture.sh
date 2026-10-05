#!/bin/sh
# Rebuild exampleData/hprc-chrM-3samples.sorted.gam: reads simulated from the
# chrM haplotypes of three HPRC samples, kept where they touch the first 650 bp
# of the graph, and labelled with their sample and one of two read groups each.
# The faceted figures in doc/images/facets-*.png draw it. Run from the repo
# root; needs vg and python3.
set -e

graph=exampleData/hprc-chrM.gbz
out=exampleData/hprc-chrM-3samples.sorted.gam
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

vg paths -x "$graph" -X | vg view -a - >"$work/paths.json"
for sample in HG00438 HG02886 HG00735; do
  vg sim -x "$graph" -m "$sample" -n 1500 -l 100 -e 0.004 -i 0.0005 -s 7 -J \
    >"$work/sim-$sample.json"
done

python3 - "$work" <<'EOF'
import json, random, sys
work = sys.argv[1]
window = set()
for line in open(f'{work}/paths.json'):
    pos = 0
    for m in json.loads(line)['path']['mapping']:
        if pos <= 650:
            window.add(int(m['position']['node_id']))
        pos += sum(e.get('from_length', 0) for e in m['edit'])
rng = random.Random(11)
with open(f'{work}/labelled.json', 'w') as out:
    for sample in ['HG00438', 'HG02886', 'HG00735']:
        for line in open(f'{work}/sim-{sample}.json'):
            a = json.loads(line)
            if {int(m['position']['node_id']) for m in a['path']['mapping']} & window:
                a['sample_name'] = sample
                a['read_group'] = f'{sample}_L00{rng.randint(1, 2)}'
                a['mapping_quality'] = 60
                out.write(json.dumps(a) + '\n')
EOF

vg view -JGa "$work/labelled.json" >"$work/reads.gam"
vg gamsort -i "$out.gai" "$work/reads.gam" >"$out"
