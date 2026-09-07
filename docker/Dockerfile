FROM ubuntu:24.04
LABEL maintainer="jmonlong@ucsc.edu"

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

ENV TZ=America/Los_Angeles

# install basic apt dependencies
RUN apt-get -qq update && apt-get -qq install -y \
    ca-certificates \
    curl \
    wget \
    less \
    nano \
    make \
    g++ \
    gcc \
    zlib1g-dev \
    libbz2-dev \
    liblzma-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# install tabix/bgzip
RUN wget --quiet https://github.com/samtools/htslib/releases/download/1.21/htslib-1.21.tar.bz2 && \
    tar -xjf htslib-1.21.tar.bz2 && \
    cd htslib-1.21 && \
    ./configure && \
    make && make install && \
    cd .. && rm -rf htslib-1.21 htslib-1.21.tar.bz2

# install node. 22 is what CI uses, and `pnpm serve` needs 22.6+ for
# --experimental-strip-types.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get -qq install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# pnpm is the package manager for this repo; corepack takes the version from
# package.json's lockfile ecosystem rather than pinning it here twice.
RUN corepack enable && corepack prepare pnpm@11 --activate

# download vg binary. Keep this in step with .github/workflows/test.yml.
RUN wget --quiet https://github.com/vgteam/vg/releases/download/v1.74.1/vg \
	&& mv vg /bin/vg && chmod +x /bin/vg

WORKDIR /build
COPY . /build/sequenceTubeMap/

# change the config to look for files in /data
COPY docker/config.json /build/sequenceTubeMap/src/

WORKDIR /build/sequenceTubeMap

RUN pnpm install --frozen-lockfile

RUN pnpm run build

CMD ["pnpm", "run", "serve"]
