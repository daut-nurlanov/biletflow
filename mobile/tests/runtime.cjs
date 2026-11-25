const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Error, URL,
    AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === '../i18n/LocaleContext') return localeMock;
      if (name === '../i18n/messages') return messages;
      if (name === 'expo-crypto') return require('node:crypto');
      return require(name);
    }, ...globals });
  return module.exports;
}

function runtime() {
  const cells = [];
  let index = 0;
  const pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!Object.hasOwn(cells, i)) cells[i] = typeof initial === 'function' ? initial() : initial;
      return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
    },
    useRef(initial) {
      const i = index++;
      if (!Object.hasOwn(cells, i)) cells[i] = { current: initial };
      return cells[i];
    },
    useMemo(factory, deps) {
      const i = index++;
      if (!same(cells[i]?.deps, deps)) cells[i] = { deps, value: factory() };
      return cells[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = index++;
      if (!same(cells[i]?.deps, deps)) pending.push(() => {
        cells[i]?.cleanup?.();
        cells[i] = { deps, cleanup: effect() };
      });
    },
    createContext: () => ({ Provider: 'Provider' }),
    useContext: (context) => context.value,
  };
  react.useLayoutEffect = react.useEffect;
  return {
    react,
    focus: (effect) => react.useEffect(effect, [effect]),
    render(component, props = {}) { index = 0; return component(props); },
    async flush() { for (const effect of pending.splice(0)) effect(); await new Promise(setImmediate); },
    cleanup() { for (const cell of cells) cell?.cleanup?.(); },
  };
}

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children), ...nodes(value.props?.ListHeaderComponent)];
}
const native = Object.fromEntries(['Text', 'TextInput', 'View', 'FlatList', 'Image', 'Pressable', 'ActivityIndicator'].map((key) => [key, key]));
native.StyleSheet = { create: (styles) => styles, absoluteFill: {} };
native.Platform = { OS: 'ios' };
const theme = { colors: {}, spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12 }, fontSize: {} };
const messages = load(path.resolve(__dirname, '../src/i18n/messages.ts'));
const english = { lang: 'en', setLang: () => {}, t: (key, vars) => messages.translate(key, 'en', vars) };
const localeMock = { useLocale: () => english };
module.exports = { load, runtime, nodes, native, theme, localeMock, messages };
