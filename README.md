Superscheda
===

[![pipeline status](https://gitlab.com/5p4k/superscheda/badges/master/pipeline.svg)](https://gitlab.com/5p4k/superscheda/commits/master)

**Superscheda is a Dungeons and Dragon's interactive character sheet.**

Currently, it's a single-file web app inspired to DnD 3.5's character sheet;
it uses Dropbox as a back-end to store and retrieve data in JSON format and a
custom Bootstrap build for layout and graphics.
The data model is inherently defined by custom attributes on controls and HTML
elements. Dynamic (and nested) lists of elements are supported and render as a
JSON array in the data file. A simple expression mechanism driven by attribtues
can be used to suggest values and pre-compute some fields.

It's mostly in Italian, but internationalization may be added in the future.
