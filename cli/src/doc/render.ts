import { Index } from ".";
import { join, basename, relative, extname, dirname } from "path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync
} from "fs";
import { renderFile } from "ejs";
import { Path } from "./path";

const anchor = require("markdown-it-anchor");
const prism = require("markdown-it-prism");

export class Render {
  input: string;
  code: string;
  output: string;
  indexes: Index[] = [];
  preloadPath: string;
  assetsPath: string;
  path: Path;
  meta: any;
  anchor: any = {};

  constructor(input: string, code: string, output: string) {
    this.input = input;
    this.code = code;
    this.output = join(output, this.code);
    this.preloadPath = output;
    this.assetsPath = join(output, "assets");
    this.indexes = [];
    this.path = new Path(output);
  }

  get md() {
    let md = require("markdown-it")({
      html: true
    });
    this.anchor = {};
    md = md.use(anchor, {
      callback: (option: any, data: any) => {
        this.anchor[data["title"]] = data["slug"];
      },
      permalink: true
    });
    md = md.use(prism, {
      defaultLanguage: "bash"
    });
    let meta: any = {};
    md = md.use(require("markdown-it-front-matter"), function(fm: string) {
      let lines = fm.split(/\n+/);
      lines.forEach(l => {
        let data = l.trim().split(":");
        if (data.length >= 2)
          meta[data[0].trim().toLowerCase()] = data[1].trim();
      });
    });
    this.meta = meta;
    return md;
  }

  async render() {
    mkdirSync(this.output, { recursive: true });
    this.renderReadme();
    this.renderDir(this.input);
  }

  async renderDir(dir: string) {
    let paths = readdirSync(dir);
    for (let i = 0; i < paths.length; i++) {
      let p = join(dir, paths[i]);
      // 判断是否是文件夹
      if (statSync(p).isDirectory()) {
        mkdirSync(join(this.output, relative(this.input, p)), {
          recursive: true
        });
        await this.renderDir(p);
        continue;
      }
      if (extname(p).toLowerCase() !== ".md") {
        console.log(p, "is not markdown file skip");
        continue;
      }
      await this.renderMarkdown(p);
    }
    writeFileSync(
      join(this.output, "indexes.json"),
      JSON.stringify(this.indexes)
    );
  }

  async renderReadme() {
    let path = this.path.readme;
    let file = readFileSync(path).toString();
    let filename = basename(path, extname(path));
    let outFilename = "00_" + filename + ".html";
    let outPath = join(this.output, outFilename);
    writeFileSync(
      outPath,
      await renderFile(join(__dirname, "template", "doc.html.ejs"), {
        markdown: this.md.render(file),
        assets: relative(dirname(outPath), this.assetsPath)
      })
    );
    this.indexes.push({
      t: filename,
      d: "from " + filename,
      p: this.path.relate(outPath)
    });
  }

  async renderMarkdown(path: string) {
    let file = readFileSync(path).toString();
    let filename = basename(path, extname(path));
    let outFilename = filename + ".html";
    let outPath = join(
      this.output,
      relative(this.input, dirname(path)),
      outFilename
    );

    writeFileSync(
      outPath,
      await renderFile(this.path.tplDoc, {
        markdown: this.md.render(file),
        assets: relative(dirname(outPath), this.assetsPath)
      })
    );

    let relativeFile = this.path.relate(outPath);
    let name = this.meta["title"] ? this.meta["title"] : filename;
    let desc = this.meta["description"]
      ? this.meta["description"]
      : "from page: " + name;
    this.indexes.push({
      t: name.replace(/"|'\[\]`/g, ""),
      d: desc,
      p: relativeFile
    });
    this.headerIndexes(relativeFile);
  }

  headerIndexes(relativePreloadFile: string) {
    for (let k in this.anchor) {
      this.indexes.push({
        t: k,
        d: k,
        p: relativePreloadFile + `#${this.anchor[k]}`
      });
    }
  }
}
