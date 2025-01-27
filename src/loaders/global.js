var fs = require("fs");
var utils = require("./utils.js");
const colors = require("colors");
const loaderUtils = require("loader-utils");
//需要一个lang来保存读取文件中的数据,避免重复翻译
var GlobalLang = {};
var log = console.log;
console.log = (...args) => {
  log("\n" + " global ".black.bgBlue, ...args);
}
const _init = (langs) => {
  // 遍历一次langs 文件不存在则创建 存在则读取
  langs.forEach((item) => {
    let {
      path,
      name
    } = item;
    if (!fs.existsSync(path)) {
      console.log((path + " not exists!").yellow);
      fs.writeFileSync(path, JSON.stringify({}, null, "\t"), {
        flag: "w",
        encoding: "utf8"
      });
    }
    GlobalLang[name] = JSON.parse(fs.readFileSync(path, {
      encoding: "utf8"
    }));
  });
}

const getLangIndexes = (langs) => {
  return langs.map(({
    name
  }) => {
    return GlobalLang[name]
  })
}

const _processTranslate = async ({
  inputSource,
  options,
  objPaths
}) => {
  let globalLangChangeMap = {}

  let hasTrans = {};
  //寻找 $t(xxx)
  let matches = inputSource.match(/\$t\((.*)\)/g);
  const filePathObjStr = objPaths.join(',')
  if (!globalLangChangeMap[filePathObjStr]) {
    globalLangChangeMap[filePathObjStr] = {}
  }

  if (matches) {
    for (let match of matches) {
      let keys = utils.getKeys(match);

      for (let key of keys) {
        //拿到$t()中间的文字
        let willTranslateKey = key.substring(4, key.length - 2);

        let langIndexs = getLangIndexes(options.langs);

        for (let nextNodeName of objPaths) {
          langIndexs = langIndexs.map((item) => {
            if (!item[nextNodeName]) {
              item[nextNodeName] = {};
            }
            return item = item[nextNodeName];
          })
        }

        globalLangChangeMap[filePathObjStr][willTranslateKey] = true

        if (objPaths.length) {
          let sourceLang = options.langs[0].name;
          for (let j = 0, len = langIndexs.length; j < len; j++) {
            if (!hasTrans[options.langs[j].name]) {
              hasTrans[options.langs[j].name] = {};
            }
            let langIndex = langIndexs[j];
            //如果是source的索引
            if (j === 0) {
              langIndex[willTranslateKey] = willTranslateKey;
            } else if (!hasTrans[options.langs[j].name][willTranslateKey] && !langIndex[willTranslateKey]) {
              try {
                // console.log("不存在嘛? ".red,langIndex[willTranslateKey])
                // console.log("000000",j,len,options.langs[j].name)

                let targetLang = options.langs[j].name;
                langIndex[willTranslateKey] = await options.translate(sourceLang, targetLang, willTranslateKey);
                //cache
                hasTrans[options.langs[j].name][willTranslateKey] = langIndex[willTranslateKey];
              } catch (error) {
                console.log((willTranslateKey + "翻译出错").red, error)
                langIndex[willTranslateKey] = "!! TRANSLATE ERROR !!"
              }
            } else {
              langIndex[willTranslateKey] = hasTrans[options.langs[j].name][willTranslateKey] || langIndex[willTranslateKey];
            }
          }
        }

        let pathStr = `[\\'` + objPaths.concat(willTranslateKey).join(`\\'][\\'`) + `\\']`
        inputSource = inputSource.replace(key, `$t('${pathStr}')`);
      }

    }
  }
  return { outputSource: inputSource, globalLangChangeMap };
}

const findLangObj = function (objPath, rootLangObj) {
  return objPath.reduce((result, key) => {
    if (result) {
      return result[key]
    }
    return {}
  }, rootLangObj)
}

const deleteUselessKey = function (langObj, globalLangChangeMap) {
  Object.keys(globalLangChangeMap).forEach((objPathStr) => {
    const objPath = objPathStr.split(',')
    const fileLangObj = findLangObj(objPath, langObj)
    const needToSaveObj = globalLangChangeMap[objPathStr]
    fileLangObj && Object.keys(fileLangObj).forEach((key) => {
      if (!needToSaveObj[key]) {
        delete fileLangObj[key]
        // 删除空翻译
        let checkFileLangObj = fileLangObj
        let checkObjPath = objPath
        while (checkObjPath.length && Object.keys(checkFileLangObj).length === 0) {
          const parentObjPath = checkObjPath.slice(0, checkObjPath.length - 1)
          const fileLangObjParent = findLangObj(parentObjPath, langObj)
          delete fileLangObjParent[checkObjPath[checkObjPath.length - 1]]
          checkFileLangObj = fileLangObjParent
          checkObjPath = parentObjPath
        }
      }
    })
  })
}

const saveToLangFile = function (langs, globalLangChangeMap) {
  langs.forEach(item => {
    // 比对globalLangChangeMap和GlobalLang，删去不需要的翻译
    deleteUselessKey(GlobalLang[item.name], globalLangChangeMap);
    let willWriteContent = JSON.stringify(GlobalLang[item.name], null, "\t"),
      oldContent = fs.readFileSync(item.path, {
        encoding: "utf8"
      });

    if (oldContent !== willWriteContent) {
      fs.writeFileSync(item.path, willWriteContent, {
        flag: "w",
        encoding: "utf8"
      });
      console.log(("更新file: " + item.path).green);

    }
  })
}

module.exports = async function (source) {

  const options = loaderUtils.getOptions(this);
  //我们需要拿到这个文件的path，以确定他是src下哪个目录下的哪个文件

  let langs = options.langs;

  _init(langs);
  let objPaths = utils.getObjPath(this.resourcePath);

  var { outputSource, globalLangChangeMap } = await _processTranslate({
    inputSource: source,
    options,
    objPaths
  });

  saveToLangFile(langs, globalLangChangeMap);

  return outputSource;
}