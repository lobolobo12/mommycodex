import { expect,it } from 'vitest';
import { styleMarkdown } from './markdown';
it('automatically styles prose while keeping the original code fences, links, paths and layout',()=>{
 const source='# Hello darling\n\nHello **darling**. Open `src/App.tsx` and [the docs](https://example.com).\n\n~~~~ts\nconst value = "Hello darling";\n~~~~\n';
 const out=styleMarkdown(source);expect(out).toContain('# H-Hewwo dawwing');expect(out).toContain('**dawwing**');expect(out).toContain('`src/App.tsx`');expect(out).toContain('[the docs](https://example.com)');expect(out).toContain('~~~~ts\nconst value = "Hello darling";\n~~~~');expect(styleMarkdown(source,0)).toBe(source);
});
it('keeps literal Markdown punctuation escaped when transforming text',()=>{
 const out=styleMarkdown('Hello \\*darling\\* and &lt;friend&gt;.');expect(out).toContain('\\*dawwing\\*');expect(out).toContain('\\<fwiend\\>');
});

it('preserves YAML frontmatter and literal technical paths',()=>{
 const md='---\ntitle: Hello darling\nfile: src/main.ts\n---\n\nHello from user_service.ts and src/main.ts.';
 const out=styleMarkdown(md);expect(out).toContain('---\ntitle: Hello darling\nfile: src/main.ts\n---');expect(out).toContain('user_service.ts');expect(out).toContain('src/main.ts');
});

it('keeps escaped numbered prose from becoming a list',()=>{
 expect(styleMarkdown('1\\) Hello darling.')).toContain('1\\)');
});
