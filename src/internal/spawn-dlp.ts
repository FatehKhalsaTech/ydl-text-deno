import { toTransformStream } from "std/streams/to_transform_stream.ts";

// deno-lint-ignore no-explicit-any
const REGEX_MAP: [RegExp, (message: string[]) => any][] = [
  [
    /WARNING:.*: *(.*)/,
    ([, message]: string[]) => ({ type: "warning", message }),
  ],
  [
    /ERROR:.*: *(.*)/,
    ([, message]: string[]) => ({ type: "error", message }),
  ],
  [
    // File has already been downloaded
    /already *been *downloaded/,
    () => ({ type: "already_exists" }),
  ],
  [
    // Dowload location
    /\[download] *Destination: *(.*)/,
    ([, location]: string[]) => ({
      type: "location",
      location,
    }),
  ],
  [
    // Download Progress
    /\[download\] *(.*)% *of *~ *(.*)MiB *at *(.*)MiB\/s *ETA *(.*) *\(frag *.*\)/,
    ([, percent, total_size, speed, eta]: string[]) => ({
      type: "progress",
      percent,
      total_size,
      speed,
      eta,
    }),
  ],
  [
    // Starting Playlist Download Message
    /\[download\] *Downloading *playlist: (.*)/,
    ([, playlist_name]: string[]) => ({
      type: "starting_playlist",
      playlist_name,
    }),
  ],
  [
    // Playlist index
    /\[download\] *Downloading *item (.*) *of *(.*)/,
    ([, index, total_index]: string[]) => ({
      type: "playlist_index",
      index,
      total_index,
    }),
  ],
];

const create_process = (
  command: string,
  ...args: string[]
): Deno.Command => {
  return new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
};

export const run_ytdlp_process = async (
  outputStream: TransformStream,
  errorStream: TransformStream,
  ...args: string[]
) => {
  const process = create_process("yt-dlp", ...args).spawn();

  process.stdout.pipeThrough(new TextDecoderStream())
    .pipeThrough(toTransformStream(async function* (src: ReadableStream) {
      for await (const chunk of src) {
        let message;

        for (const [reg_exp, handler] of REGEX_MAP) {
          if (reg_exp.test(chunk)) {
            message = JSON.stringify(handler(chunk.match(reg_exp)));
            break;
          }
        }

        if (message) yield message;
      }
    }))
    .pipeThrough(new TextEncoderStream())
    .pipeTo(outputStream.writable);

  process.stderr.pipeTo(errorStream.writable);

  await process.status;
};
