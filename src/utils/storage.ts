// 存储数据

import { isProduction } from "@/config";

export function setStorageData(keyName: string, data: object) {
  return new Promise((resolve) => {
    if (isProduction) {
      window.chrome.storage.local.set({ [keyName]: data }, function () {
        resolve(true);
      });
    } else {
      window.localStorage.setItem(keyName, JSON.stringify(data));
      resolve(true);
    }
  });
}

export function getStorageData(key: string) {
  return new Promise((resolve) => {
    if (isProduction) {
      window.chrome.storage.local.get([key], function (result: object | null) {
        resolve(result);
      });
    } else {
      try {
        const data: string | null = window.localStorage.getItem(key) || '{}';
        resolve(JSON.parse(data));
      } catch (error) { resolve(null); }
    }
  });
}
