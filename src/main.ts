import 'dotenv/config'
import { Client, VoiceBasedChannel } from 'discord.js'
import prism from 'prism-media'
import {
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  joinVoiceChannel,
} from '@discordjs/voice'
import { createServer } from 'net'
import { PassThrough } from 'stream'
import Fastify from 'fastify'

const fastify = Fastify({ logger: true })

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Stop,
  },
})

const encoder = new prism.opus.Encoder({
  frameSize: 960,
  channels: 2,
  rate: 48000,
  application: 'AUDIO',
})
encoder.setBitrate(128000)

const server = createServer((socket) => {
  socket.on('data', (x) => {
    encoder.write(x)
  })
}).listen(+process.env.PORT || 28282, () => {
  console.log('Listening on port ' + (server.address() as any).port)
})

encoder.on('data', (x) => {})

player.on('stateChange', (oldState, newState) => {
  if (
    oldState.status === AudioPlayerStatus.Idle &&
    newState.status === AudioPlayerStatus.Playing
  ) {
    console.log('Playing audio output on audio player')
  } else if (newState.status === AudioPlayerStatus.Idle) {
    console.log('Playback has stopped. Attempting to restart.')
    attachRecorder()
  }
})

function attachRecorder() {
  const reader = new PassThrough({ objectMode: true })
  const handler = (x) => {
    reader.write(x)
  }
  encoder.on('data', handler)
  reader.on('end', () => {
    console.log('Reader ended')
    encoder.removeListener('data', handler)
  })
  player.play(createAudioResource(reader, { inputType: StreamType.Opus }))
  console.log('Attached recorder - ready to go!')
}

async function connectToChannel(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  })
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000)
    return connection
  } catch (error) {
    connection.destroy()
    throw error
  }
}

const client = new Client({
  intents: ['Guilds', 'GuildVoiceStates', 'MessageContent', 'GuildMembers'],
})

interface ChatHistoryEntry {
  id: string
  from: string
  message: string
  timestamp: string
}

let _channel: VoiceBasedChannel | undefined
let _chatHistory: ChatHistoryEntry[] = []

client.on('ready', async () => {
  console.log('discord.js client is ready!')
  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!)!
  const channel = guild.channels.cache.get(process.env.DISCORD_CHANNEL_ID!)
  if (!channel?.isVoiceBased()) {
    console.error('Channel is not voice based')
    return
  }
  _channel = channel
  const connection = await connectToChannel(channel)
  connection.subscribe(player)
  attachRecorder()
})

client.on('messageCreate', (message) => {
  if (message.channel.id !== process.env.DISCORD_CHANNEL_ID) {
    return
  }
  if (message.author.bot) {
    return
  }
  _chatHistory.push({
    id: message.id,
    from: message.member?.displayName || message.author.username,
    message: message.content,
    timestamp: message.createdAt.toISOString(),
  })
})

client.login(process.env.DISCORD_TOKEN)

if (process.env.HTTP_PORT) {
  fastify.get('/count', async () => {
    return {
      count: _channel?.members.size,
      listening: _channel?.members.filter((m) => !m.voice.deaf).size,
    }
  })
  fastify.get('/chat', async () => {
    return _chatHistory
  })
  fastify.listen({ port: +process.env.HTTP_PORT, host: '0.0.0.0' })
}
