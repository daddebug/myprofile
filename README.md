# Dilida Duman Playful Portfolio

一个面向 UX / Game UX / Interaction Design / Indie Game 项目的个人作品集前端项目。技术栈为 React、Vite、TypeScript、Tailwind CSS 和 Framer Motion。

## 运行项目

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run typecheck
npm run preview
```

如果你习惯 pnpm，也可以使用 `pnpm install`、`pnpm dev`、`pnpm build`。

## 项目结构

```txt
src/
  components/        可复用组件：项目卡片、图片占位、内容块、可玩 Demo iframe
  data/projects.ts   作品数据配置，后续新增作品主要改这里
  layouts/Shell.tsx  顶部导航、移动端菜单、页脚
  pages/             Home / Work / Project Detail / Play / About / Contact
  types/project.ts   作品和内容块 TypeScript 类型
public/
  images/            放作品图片
  games/             放 Unity WebGL、Godot Web Export、HTML5 Demo 等可玩资源
```

## 新增作品

打开 `src/data/projects.ts`，在 `projects` 数组里新增一个对象。建议复制现有示例项目再替换内容。

每个项目支持：

- `title` / `subtitle`
- `category` / `type` / `year`
- `cover`
- `images`
- `summary` / `background`
- `role` / `timeline` / `tools`
- `designGoals` / `process` / `highlights`
- `blocks`
- 可选 `playable`
- 可选 `videoUrl`
- 可选 `externalLinks`

`slug` 会用于详情页地址，例如：

```ts
{
  slug: "my-new-project",
  title: "My New Project",
  // ...
}
```

访问地址会是 `/work/my-new-project`。

## 新增图片

把图片放在：

```txt
public/images/projects/your-project-name/
```

然后在项目数据中使用以 `/images/` 开头的路径：

```ts
cover: "/images/projects/your-project-name/cover.png"
```

支持 PNG、JPG、JPEG、WebP。图片不存在时页面不会崩溃，会显示统一风格的 placeholder。

## 新增可玩 Web 游戏

把游戏导出文件放在：

```txt
public/games/your-game/
```

如果入口文件是：

```txt
public/games/your-game/index.html
```

则在作品数据里添加：

```ts
playable: {
  title: "Play My Game",
  description: "A short description of the demo.",
  iframeUrl: "/games/your-game/index.html",
  openInNewTabUrl: "/games/your-game/index.html",
}
```

详情页和 Play 页都会自动显示这个 Demo。

## 内容块类型

项目详情页通过 `blocks` 渲染长图文 case study。支持：

```ts
type ProjectBlock =
  | { type: "text"; title?: string; body: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "imageGrid"; images: { src: string; alt: string; caption?: string }[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "twoColumn"; title?: string; left: string; right: string }
  | { type: "playable"; title: string; description?: string; iframeUrl: string; openInNewTabUrl?: string }
```

这套结构适合持续添加图文内容、过程图、最终效果图和可玩 Demo。

## 自定义联系信息

当前邮箱和外部链接是占位内容。可以在这些文件中替换：

- `src/layouts/Shell.tsx`
- `src/pages/ContactPage.tsx`
- `src/pages/AboutPage.tsx`
- `src/data/projects.ts`
