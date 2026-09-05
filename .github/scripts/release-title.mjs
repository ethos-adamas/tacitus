const version = (process.argv[2] ?? "").replace(/^v/, "");
const match =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z.-]+))?(?:\+([\da-zA-Z.-]+))?$/.exec(
    version,
  );
if (
  !match ||
  [match[4], match[5]].some((part) => part?.split(".").some((id) => !id)) ||
  match[4]?.split(".").some((id) => /^0\d+$/.test(id))
) {
  throw new Error("Il tag deve contenere una versione SemVer.");
}
console.log(version);
