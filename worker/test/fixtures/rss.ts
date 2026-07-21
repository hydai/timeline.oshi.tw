export const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>abc123DEF-_</yt:videoId>
    <yt:channelId>UCaaa</yt:channelId>
    <title>最新直播</title>
  </entry>
  <entry>
    <yt:videoId>xyz789GHI</yt:videoId>
    <yt:channelId>UCaaa</yt:channelId>
    <title>前一場</title>
  </entry>
  <entry>
    <yt:videoId>abc123DEF-_</yt:videoId>
    <title>重複項應被去除</title>
  </entry>
</feed>`;
