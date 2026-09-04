#!/usr/bin/env node
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { output: { type: 'string' } } });
const output = resolve(root, values.output ?? 'runtime-assets');
const require = createRequire(import.meta.url);
const ortDist = dirname(require.resolve('onnxruntime-web'));
const ortFiles = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

async function download(repository, revision, file) {
    const url = `https://huggingface.co/PaddlePaddle/${repository}/resolve/${revision}/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败 (${response.status}): ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

function yamlString(value) {
    const scalar = value.replace(/[\t ]+$/, '');
    if (scalar.startsWith('"')) return JSON.parse(scalar);
    if (scalar.startsWith("'")) return scalar.slice(1, -1).replaceAll("''", "'");
    return scalar;
}

function dictionaryFromInferenceYaml(yaml) {
    const lines = yaml.replaceAll('\r\n', '\n').split('\n');
    const postProcess = lines.findIndex((line) => /^PostProcess:\s*$/.test(line));
    const characterDict = lines
        .slice(postProcess + 1)
        .findIndex((line) => /^\s{2}character_dict:\s*$/.test(line));
    if (postProcess < 0 || characterDict < 0) throw new Error('inference.yml 缺少字符字典');
    const dictionary = [];
    for (const line of lines.slice(postProcess + characterDict + 2)) {
        if (/^[a-z]\w*:\s*/i.test(line)) break;
        const match = line.match(/^ {2}-(?: |$)(.*)$/);
        if (match) dictionary.push(yamlString(match[1]));
    }
    if (!dictionary.length) throw new Error('inference.yml 字符字典为空');
    return dictionary;
}

const detRevision = '2ba1506c0380b8f0b03dd142459aac66d4421f6c';
const recRevision = '2612ab37152ae0a677521bae4e1e3d4fb4cf7c30';
console.log('正在下载 PP-OCRv6 Tiny 模型与字符字典…');
const [det, rec, yaml] = await Promise.all([
    download('PP-OCRv6_tiny_det_onnx', detRevision, 'inference.onnx'),
    download('PP-OCRv6_tiny_rec_onnx', recRevision, 'inference.onnx'),
    download('PP-OCRv6_tiny_rec_onnx', recRevision, 'inference.yml'),
]);
const dictionary = dictionaryFromInferenceYaml(yaml.toString('utf8'));
await Promise.all([
    mkdir(resolve(output, 'tiny'), { recursive: true }),
    mkdir(resolve(output, 'ort'), { recursive: true }),
]);
await Promise.all([
    writeFile(resolve(output, 'tiny/det.onnx'), det),
    writeFile(resolve(output, 'tiny/rec.onnx'), rec),
    writeFile(resolve(output, 'tiny/dictionary.json'), `${JSON.stringify(dictionary)}\n`),
    ...ortFiles.map((file) => copyFile(resolve(ortDist, file), resolve(output, 'ort', file))),
]);
console.log(`已生成运行时资源：${output}`);