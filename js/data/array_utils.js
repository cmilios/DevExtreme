import { isPlainObject, isEmptyObject, isDefined } from "../core/utils/type";
import config from "../core/config";
import Guid from "../core/guid";
import { extend } from "../core/utils/extend";
import { errors } from "./errors";
import objectUtils from "../core/utils/object";
import { keysEqual, rejectedPromise, trivialPromise } from "./utils";

function hasKey(target, keyOrKeys) {
    var key,
        keys = typeof keyOrKeys === "string" ? keyOrKeys.split() : keyOrKeys.slice();

    while(keys.length) {
        key = keys.shift();
        if(key in target) {
            return true;
        }
    }

    return false;
}

function findItems(keyInfo, items, key, groupCount) {
    var childItems,
        result;

    if(groupCount) {
        for(var i = 0; i < items.length; i++) {
            childItems = items[i].items || items[i].collapsedItems || [];
            result = findItems(keyInfo, childItems || [], key, groupCount - 1);
            if(result) {
                return result;
            }
        }
    } else if(indexByKey(keyInfo, items, key) >= 0) {
        return items;
    }
}

function getItems(keyInfo, items, key, groupCount) {
    if(groupCount) {
        return findItems(keyInfo, items, key, groupCount) || [];
    }

    return items;
}

function generateHasKeyCache(keyInfo, array) {
    if(keyInfo.key() && !array._hasKeyMap) {
        var hasKeyMap = {};
        for(var i = 0, arrayLength = array.length; i < arrayLength; i++) {
            hasKeyMap[JSON.stringify(keyInfo.keyOf(array[i]))] = true;
        }

        array._hasKeyMap = hasKeyMap;
    }
}

function getHasKeyCacheValue(array, key) {
    if(array._hasKeyMap) {
        return array._hasKeyMap[JSON.stringify(key)];
    }

    return true;
}

function setHasKeyCacheValue(array, key) {
    if(array._hasKeyMap) {
        array._hasKeyMap[JSON.stringify(key)] = true;
    }
}

function applyBatch(keyInfo, array, batchData, groupCount, useInsertIndex) {
    batchData.forEach(item => {
        var items = item.type === "insert" ? array : getItems(keyInfo, array, item.key, groupCount);

        generateHasKeyCache(keyInfo, items);

        switch(item.type) {
            case "update": update(keyInfo, items, item.key, item.data, true); break;
            case "insert": insert(keyInfo, items, item.data, useInsertIndex && isDefined(item.index) ? item.index : -1, true); break;
            case "remove": remove(keyInfo, items, item.key, true); break;
        }
    });
}

function update(keyInfo, array, key, data, isBatch) {
    var target,
        extendComplexObject = true,
        keyExpr = keyInfo.key();

    if(keyExpr) {
        if(hasKey(data, keyExpr) && !keysEqual(keyExpr, key, keyInfo.keyOf(data))) {
            return !isBatch && rejectedPromise(errors.Error("E4017"));
        }

        let index = indexByKey(keyInfo, array, key);
        if(index < 0) {
            return !isBatch && rejectedPromise(errors.Error("E4009"));
        }

        target = array[index];
    } else {
        target = key;
    }

    objectUtils.deepExtendArraySafe(target, data, extendComplexObject);
    if(!isBatch) {
        if(config().useLegacyStoreResult) {
            return trivialPromise(key, data);
        } else {
            return trivialPromise(target, key);
        }
    }
}

function insert(keyInfo, array, data, index, isBatch) {
    var keyValue,
        obj,
        keyExpr = keyInfo.key();

    obj = isPlainObject(data) ? extend({}, data) : data;

    if(keyExpr) {
        keyValue = keyInfo.keyOf(obj);
        if(keyValue === undefined || typeof keyValue === "object" && isEmptyObject(keyValue)) {
            if(Array.isArray(keyExpr)) {
                throw errors.Error("E4007");
            }
            keyValue = obj[keyExpr] = String(new Guid());
        } else {
            if(array[indexByKey(keyInfo, array, keyValue)] !== undefined) {
                return !isBatch && rejectedPromise(errors.Error("E4008"));
            }
        }
    } else {
        keyValue = obj;
    }
    if(index >= 0) {
        array.splice(index, 0, obj);
    } else {
        array.push(obj);
    }

    setHasKeyCacheValue(array, keyValue);

    if(!isBatch) {
        return trivialPromise(config().useLegacyStoreResult ? data : obj, keyValue);
    }
}

function remove(keyInfo, array, key, isBatch) {
    var index = indexByKey(keyInfo, array, key);
    if(index > -1) {
        array.splice(index, 1);
    }
    if(!isBatch) {
        return trivialPromise(key);
    }
}

function indexByKey(keyInfo, array, key) {
    var keyExpr = keyInfo.key();

    if(!getHasKeyCacheValue(array, key)) {
        return -1;
    }

    for(var i = 0, arrayLength = array.length; i < arrayLength; i++) {
        if(keysEqual(keyExpr, keyInfo.keyOf(array[i]), key)) {
            return i;
        }
    }
    return -1;
}

module.exports.applyBatch = applyBatch;
module.exports.update = update;
module.exports.insert = insert;
module.exports.remove = remove;
module.exports.indexByKey = indexByKey;
