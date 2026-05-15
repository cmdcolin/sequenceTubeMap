import gzip
import sys
import argparse
import datetime
import subprocess


def log(msg):
    print(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), '-', msg, file=sys.stderr)

parser = argparse.ArgumentParser(description='Build tabix index files for a pangenome.')
parser.add_argument('-g', help='pangenome in GFA', required=True)
parser.add_argument('-o', help='output prefix', default='pg')
parser.add_argument('-s', help='size of haplotype blocks to save', default=100)
parser.add_argument('-r', help='path name prefix filter for P-lines (default: all)', default='')
args = parser.parse_args()

nodes = {}
orients = ['<', '>']


# TODO try without auto_flip. Don't remember if it's really necessary.
def parsePath(path_raw, auto_flip=True):
    cur_node = ''
    cur_orient = ''
    path = []
    fwd_diff = 0
    for ch in path_raw:
        if ch == '<' or ch == '>':
            if cur_node != '':
                path.append([int(cur_node), cur_orient])
            cur_orient = ch == '>'
            fwd_diff += 1 if cur_orient else -1
            cur_node = ''
        else:
            cur_node += ch
    if cur_node != '':
        path.append([int(cur_node), cur_orient])
    # flip path if mostly in reverse?
    if auto_flip and fwd_diff < 0:
        path.reverse()
        for ii in range(len(path)):
            path[ii][1] = not path[ii][1]
    return path


def parsePathP(path_raw):
    cur_node = ''
    path = []
    for ch in path_raw:
        if ch == '+' or ch == '-':
            path.append([int(cur_node), ch == '+'])
            cur_node = ''
        elif ch != ',':
            cur_node += ch
    return path


def prepareHapChunk(path, nodes, name='ref', coord=''):
    gaf_v = name
    # path length/start/end/strand
    path_len = sum([nodes[no[0]][0] for no in path])
    gaf_v += '\t{}\t0\t{}\t+'.format(path_len, path_len)
    # path information: string representation and length
    min_node = path[0][0]
    max_node = path[0][0]
    path_parts = []
    for no in path:
        path_parts.append(orients[no[1]] + str(no[0]))
        min_node = min(min_node, no[0])
        max_node = max(max_node, no[0])
    gaf_v += '\t{}\t{}'.format(''.join(path_parts), path_len)
    gaf_v += '\t{}\t{}'.format(0, path_len)
    # residues matching, alignment block size, and mapping quality
    fake_mapq = 60
    gaf_v += '\t{}\t{}\t{}'.format(path_len, path_len, fake_mapq)
    # cigar string
    gaf_v += '\tcs:Z::{}'.format(path_len)
    # coordinate tag
    if coord != '':
        gaf_v += '\trc:Z:{}'.format(coord)
    return ({'gaf': gaf_v, 'path_len': path_len,
             'min_node': min_node, 'max_node': max_node})


# Pass 1: collect all S-lines (handles GFAs where S/L lines are interleaved)
def open_gfa(path):
    return gzip.open(path, 'rt') if path.endswith('gz') else open(path, 'rt')

log('Reading {}...'.format(args.g))
with open_gfa(args.g) as gfa_inf:
    for line in gfa_inf:
        line = line.rstrip().split('\t')
        if line[0] == 'S':
            nodes[int(line[1])] = [len(line[2]), line[2]]

# write node file
log('Writing node file...')
n_gz_p = subprocess.Popen("bgzip > " + args.o + ".nodes.tsv.gz",
                          stdin=subprocess.PIPE, shell=True)
for node in sorted(nodes):
    tow = 'n\t{}\t{}\n'.format(node, nodes[node][1])
    n_gz_p.stdin.write(tow.encode())
n_gz_p.stdin.close()
n_gz_p.wait()
log('Node information written to {}.'.format(args.o + ".nodes.tsv.gz"))
log('Indexing nodes')
subprocess.run(['tabix', '-f', '-s', '1', '-b', '2', '-e', '2',
                args.o + ".nodes.tsv.gz"], check=True)
log('Nodes indexed.')

# Pass 2: process paths
# start processes to sort and bgzip output
h_gz_cmd = "vg gamsort -G - | bgzip > " + args.o + '.haps.gaf.gz'
h_gz_p = subprocess.Popen(h_gz_cmd, stdin=subprocess.PIPE, shell=True)
p_gz_cmd = "sort -k1V -k2n -k3n | bgzip > " + args.o + '.pos.bed.gz'
p_gz_p = subprocess.Popen(p_gz_cmd, stdin=subprocess.PIPE, shell=True)

pos_fmt = '{}\t{}\t{}\t{}\t{}\n'
npaths = 0
with open_gfa(args.g) as gfa_inf:
    for line in gfa_inf:
        line = line.rstrip().split('\t')
        path = []
        if line[0] == 'W':
            path = parsePath(line[6])
            sampn = line[1]
            hapn = '#' + line[2]
            pathn = '#' + line[3]
            startpos = int(line[4])
        elif line[0] == 'P' and line[1].startswith(args.r):
            path = parsePathP(line[2])
            sampn = line[1]
            pathn = ''
            hapn = ''
            startpos = 0
        if len(path) > 0:
            # we've parsed a path
            # save node positions
            # save haplotype in GAF chunks
            path_pos = 0
            hap_pos = startpos
            while path_pos < len(path):
                path_end = min(len(path), path_pos + args.s)
                seqn = '{}{}{}'.format(sampn, hapn, pathn)
                coordn = '{}:{}'.format(seqn, hap_pos)
                hapchunk = prepareHapChunk(path[path_pos:path_end],
                                           nodes, name=sampn,
                                           coord=coordn)
                # write GAF record
                tow = hapchunk['gaf'] + '\n'
                h_gz_p.stdin.write(tow.encode())
                # write position BED record
                tow = pos_fmt.format(seqn, hap_pos,
                                     hap_pos + hapchunk['path_len'],
                                     hapchunk['min_node'],
                                     hapchunk['max_node'])
                p_gz_p.stdin.write(tow.encode())
                # update position on haplotype
                hap_pos += hapchunk['path_len']
                # go to next chunk
                path_pos = path_end
            npaths += 1
            if npaths % 10000 == 0:
                log('Wrote info for {} paths'.format(npaths))

# close position BED bgzip process
p_gz_p.stdin.close()

# close haps GAF bgzip process
h_gz_p.stdin.close()

log('Waiting for sort/bgzip processes to finish.')
p_gz_p.wait()
h_gz_p.wait()
log('Output files sorted and bgzipped.')

log('Indexing position BED')
subprocess.run(['tabix', '-p', 'bed', args.o + ".pos.bed.gz"], check=True)
log('Position BED indexed.')

log('Indexing haplotype GAF')
subprocess.run(['tabix', '-p', 'gaf', args.o + ".haps.gaf.gz"], check=True)
log('Haplotype GAF indexed.')
