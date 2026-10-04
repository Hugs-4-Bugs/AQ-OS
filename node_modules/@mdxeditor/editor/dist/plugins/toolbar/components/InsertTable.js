import { ButtonWithTooltip } from "../primitives/toolbar.js";
import React__default from "react";
import { insertTable$ } from "../../table/index.js";
import { useCellValue, usePublisher, Cell, map } from "@mdxeditor/gurx";
import { iconComponentFor$, useTranslation, activeEditor$ } from "../../core/index.js";
const disableInsertTableButton$ = Cell(false, (r) => {
  r.link(
    r.pipe(
      activeEditor$,
      map((editor) => {
        var _a, _b;
        return ["td", "th"].includes(((_b = (_a = editor == null ? void 0 : editor.getRootElement()) == null ? void 0 : _a.parentNode) == null ? void 0 : _b.nodeName.toLowerCase()) ?? "");
      })
    ),
    disableInsertTableButton$
  );
});
const InsertTable = () => {
  const iconComponentFor = useCellValue(iconComponentFor$);
  const insertTable = usePublisher(insertTable$);
  const t = useTranslation();
  const isDisabled = useCellValue(disableInsertTableButton$);
  return /* @__PURE__ */ React__default.createElement(
    ButtonWithTooltip,
    {
      title: t("toolbar.table", "Insert Table"),
      onClick: () => {
        insertTable({ rows: 3, columns: 3 });
      },
      ...isDisabled ? { "aria-disabled": true, "data-disabled": true, disabled: true } : {}
    },
    iconComponentFor("table")
  );
};
export {
  InsertTable
};
