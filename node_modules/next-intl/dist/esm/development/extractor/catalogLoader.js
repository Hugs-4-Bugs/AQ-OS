import path from 'path';
import { getFormatExtension, resolveCodec } from './format/index.js';

let cachedCodec = null;
async function getCodec(options, projectRoot) {
  if (!cachedCodec) {
    cachedCodec = await resolveCodec(options.messages.format, projectRoot);
  }
  return cachedCodec;
}

/**
 * Parses and optimizes catalog files.
 *
 * Note that if we use a dynamic import like `import(`${locale}.json`)`, then
 * the loader will optimistically run for all candidates in this folder (both
 * during dev as well as at build time).
 */
function catalogLoader(source) {
  const options = this.getOptions();
  const callback = this.async();
  const extension = getFormatExtension(options.messages.format);
  getCodec(options, this.rootContext).then(codec => {
    const locale = path.basename(this.resourcePath, extension);
    const jsonString = codec.toJSONString(source, {
      locale
    });

    // https://v8.dev/blog/cost-of-javascript-2019#json
    const result = `export default JSON.parse(${JSON.stringify(jsonString)});`;
    callback(null, result);
  }).catch(callback);
}

export { catalogLoader as default };
