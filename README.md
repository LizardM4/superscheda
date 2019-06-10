Superscheda
===

[![pipeline status](https://gitlab.com/5p4k/superscheda/badges/master/pipeline.svg)](https://gitlab.com/5p4k/superscheda/commits/master)

**Superscheda is a Dungeons and Dragon's interactive character sheet.**  
**Try it out here: [https://dd.5p4k.me](https://dd.5p4k.me)**

Currently, it's a single-file web app inspired to DnD 3.5's character sheet;
it uses Dropbox as a back-end to store and retrieve data in JSON format and a
custom Bootstrap build for layout and graphics.
The data model is inherently defined by custom attributes on controls and HTML
elements. Dynamic (and nested) lists of elements are supported and render as a
JSON array in the data file. A simple expression mechanism driven by attribtues
can be used to suggest values and pre-compute some fields.

It's mostly in Italian, but internationalization may be added in the future.

How to build
---
The app is packed using [Webpack](https://webpack.js.org/) because it needs to
customize [Bootstrap](https://getbootstrap.com/docs/4.3/getting-started/introduction/).

Note from the original author:
> I apologize to any developer for having to set
> up and use NPM and Webpack, as well as for having to use Javascript. I resisted
> as much as possible, writing everything in vanilla (old) JS and then vanilla
> ES6 + CSS, but ultimately I had to give in. Javascript is pure evil madness and
> Webpack the son of the devil, but that's what everyone uses.

Steps 1-3 are needed only for the first setup:

1. clone this repository to e.g. `~/dev/superscheda` using `git clone https://gitlab.com/5p4k/superscheda.git`
2. install NodeJS and NPM, see [https://nodejs.org/en/download/current/](here)
3. download all the packages and prepare to build: `cd ~/dev/superscheda; npm i`.
4. to build: `npm run build`.

To build for production: `npm run build-prod`; the build files are in the
subfolder `dist/`. To be able to test your changes, you need to manually serve
the `dist` subfolder and access it via a web browser, e.g. via
`cd ~/dev/superscheda/dist; python -m http.server` (which can be interrupted via
ctrl+c) and by opening `http://localhost:8000`.