# pcm2discord

A simple server that sends PCM audio data to a Discord voice channel.

Expected audio format is **16-bit signed PCM, 48kHz, stereo.**

## Usage

Create `.env` file:

```sh
DISCORD_TOKEN=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
```

Install dependencies:

```sh
docker-compose run --rm worker yarn
```

Run the bot:

```sh
docker-compose up
```

Then send your audio to the TCP server at `127.0.0.1:28282`. It is expected that the audio data will arrive in real-time. There is also an API endpoint at `http://127.0.0.1:28280/count` that returns the number of listeners.
