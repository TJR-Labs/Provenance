import postcss, { type Root } from "postcss";
import selectorParser from "postcss-selector-parser";

export function profileScopeClass(username: string) {
  return `profile-scope-${username.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
}

export function sanitizeCustomCss(css: string, username: string) {
  let root: Root;
  try {
    root = postcss.parse(css);
  } catch {
    return "";
  }
  const scope = profileScopeClass(username);

  root.walkAtRules((rule) => {
    if (
      ["import", "font-face", "keyframes", "-webkit-keyframes"].includes(
        rule.name.toLowerCase(),
      )
    ) {
      rule.remove();
    }
  });

  root.walkDecls((declaration) => {
    if (/url\s*\(/i.test(declaration.value)) declaration.remove();
  });

  root.walkRules((rule) => {
    try {
      const scoped = selectorParser((selectors) => {
        selectors.each((selector) => {
          let forbidden = false;
          selector.walkTags((tag) => {
            if (["html", "body"].includes(tag.value.toLowerCase()))
              forbidden = true;
          });
          selector.walkPseudos((pseudo) => {
            if (pseudo.value.toLowerCase() === ":root") forbidden = true;
          });

          if (forbidden) {
            selector.remove();
            return;
          }

          selector.prepend(selectorParser.combinator({ value: " " }));
          selector.prepend(selectorParser.className({ value: scope }));
        });
      }).processSync(rule.selector);

      if (!scoped.trim()) rule.remove();
      else rule.selector = scoped;
    } catch {
      rule.remove();
    }
  });

  return root.toString().replace(/<\/style/gi, "<\\/style");
}
