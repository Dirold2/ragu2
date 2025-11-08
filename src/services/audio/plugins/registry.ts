import { BassPlugin, CompressorPlugin, FluentStream } from "fluent-streamer";
import { VolumePlugin } from './VolumePlugin.js';

FluentStream.registerPlugin("volumeFade", (options: { volume: number }) => new VolumePlugin(options));
FluentStream.registerPlugin("bass", (options: { bass: number }) => new BassPlugin(options));
FluentStream.registerPlugin("compressor", (options: { threshold: number, ratio: number }) => new CompressorPlugin(options));