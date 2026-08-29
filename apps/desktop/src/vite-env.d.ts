// Vite's `?worker` import returns a constructor that instantiates the module as
// a Web Worker, bundling it correctly for both dev and the packaged build.
// Declared here (instead of pulling in the full `vite/client` ambient types) so
// TypeScript understands the pdf.js worker import in the pdf-reader feature.
declare module "*?worker" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
