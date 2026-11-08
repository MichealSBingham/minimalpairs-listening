const examples = [
  ['ship','ʃɪp','sheep','ʃip'],
  ['bit','bɪt','beat','bit'],
  ['sit','sɪt','seat','sit'],
  ['fill','fɪl','feel','fil'],
];
export const pairs = examples.map(([first,firstSound,second,secondSound]) => ({
  id: first+'-'+second, kind:'minimal', abx:{categoryByWordIndex:[0,1]},
  words:[{text:first,ipa:firstSound,meaning:''},{text:second,ipa:secondSound,meaning:''}],
}));
