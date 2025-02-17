import * as fs from "fs/promises";
import _ from "lodash";

import {ConfiguredButton} from "@localbytes/localdeck-codegen/dist/virtuals";
import newConfig from "@localbytes/localdeck-codegen/dist/esphome-localdeck";
import espHomeYaml from "esphome-config-ts/dist/yaml/index.js";

import {PadEditor} from "@localbytes/localdeck-components/src/utils/PadCfg";
import {ConfigUtil} from "@localbytes/localdeck-components/src/utils/config-util";
import {getEditorUrl} from "@localbytes/localdeck-components/src/utils/compression";

function smartlyMerge(newCfg: any, originalContent: string): any {
    const allowlist = ["substitutions", "wifi", "captive_portal", "logger", "web_server", "api", "ota"];

    const content = espHomeYaml.parse(originalContent) as any;

    for (const [key, value] of Object.entries(content)) {
        if (allowlist.includes(key)) {
            newCfg[key] = _.merge(newCfg[key], value);
        }
    }

    return newCfg;
}

export default defineEventHandler(async (event) => {
    const {filesDir} = useRuntimeConfig();
    const {filename} = getQuery(event)
    const body = await readBody(event) satisfies { editor: DeepPartial<PadEditor> };

    const configUtil = new ConfigUtil();
    configUtil.setChanges(body.editor);

    const editor: PadEditor = configUtil.editor();

    if (!editor) {
        throw createError({
            statusCode: 400,
            statusMessage: "No editor found",
        });
    }

    const path = `${filesDir}/${filename}`;

    let originalContent = "";
    let fileContent = "";
    try {
        const search = "changes will be lost!";
        originalContent = await fs.readFile(path, "utf8");
        let pos = originalContent.indexOf(search);
        if (pos > 0) {
            fileContent = originalContent.substring(0, pos + search.length);
        }
    } catch (e) {
        // ignore
    }

    if (fileContent === "") {
        fileContent += "# This file was generated by the LocalBytes LocalDeck Configurator\n"

        let newCfg = newConfig({
            withDefaults: true,
            stopBeforeCustom: true
        }).config.synth();

        if (originalContent !== "") newCfg = smartlyMerge(newCfg, originalContent);

        fileContent += espHomeYaml.dump(newCfg);

        fileContent += "\n# Anything below this line will be removed when saving.\n"
        fileContent += "# To change this, navigate to the LocalBytes LocalDeck Configurator.\n"
        fileContent += "# Your changes will be lost!"
    }

    fileContent = fileContent.replace(/friendly_name: (.*)/, `friendly_name: ${editor.title}`)
    fileContent += `\n# Edit: ${getEditorUrl(configUtil.getChanges())}\n\n`

    let {config} = newConfig({withDefaults: false});
    Object.entries(editor.buttons).forEach(([num, b]) => config.addComponent(new ConfiguredButton(b)));
    fileContent += config.synthYaml();

    await fs.writeFile(path, fileContent, "utf8");
    return {filename, path}
});
