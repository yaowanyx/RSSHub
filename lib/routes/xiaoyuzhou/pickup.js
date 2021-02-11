const got = require('@/utils/got');
const config = require('@/config').value;

const XIAOYUZHOU_ITEMS = 'xiaoyuzhou_items';

const isToday = (date) => {
    date = new Date(date);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};

const ProcessFeed = async (ctx) => {
    const device_id = config.xiaoyuzhou.device_id || '02f31971-81b6-4879-b1bc-12d50efc9b45';
    const refresh_token =
        (await ctx.cache.get('XIAOYUZHOU_TOKEN')) ||
        config.xiaoyuzhou.refresh_token ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjoib3I4WTI5MHRnS0VRVWFaOVZBVG9BNDZMUUloK1ozcGRRZGozSWxPY1djOEdPbVZZSkNyYnRleDRZQWxHVlFjdkpUN3ZKOTBkNnp0M3R4ajNZRVB2dXBHUkFkM3VVdEVtQ1RTbFlyNGlJVjJtTmpiaFRXWndJSFhSUytrU09DbDR6bkthcTV5bmgwdmxRellScUVhbVBmYkdtOW90WUhUdTlPY3dZNkhDXC9uVzJqWXUweHhRcDlTZVVsRkpaNUlsRmh5UlVuZjBIQkhuVE52RWtjenROS1pCWkpZYlFVQUtnZHQ4UmtLY0ZBTE5rNEFIaHFjeWRocWhMSlJXWldXT2UiLCJ2IjozLCJpdiI6Im81K3k1TWJwdEFLd3pWeVJDTnpUVmc9PSIsImlhdCI6MTYxMjcxNzQxNS40Nzd9.lHE6-o1z0VBgh902nHL-zmeJnK9_BYqSFqrB7OyNu8U';

    const headers = {
        applicationid: 'app.podcast.cosmos',
        'app-version': '1.6.0',
        'x-jike-device-id': device_id,
        'user-agent': 'okhttp/4.7.2',
    };

    const token_updated = await got({
        method: 'post',
        url: 'https://api.xiaoyuzhoufm.com/app_auth_tokens.refresh',
        headers: {
            ...headers,
            'x-jike-refresh-token': refresh_token,
        },
    });
    ctx.cache.set('XIAOYUZHOU_TOKEN', token_updated.data['x-jike-refresh-token']);

    const response = await got({
        method: 'post',
        url: 'https://api.xiaoyuzhoufm.com/v1/editor-pick/list',
        headers: {
            ...headers,
            'x-jike-access-token': token_updated.data['x-jike-access-token'],
        },
    });

    const data = response.data.data;
    const playList = [];
    for (const dailyPicks of data) {
        const pubDate = new Date(dailyPicks.date + ' 00:00:00 +0800').toUTCString();
        for (const pick of dailyPicks.picks) {
            pick.pubDate = pubDate;
            playList.push(pick);
        }
    }

    return await Promise.all(
        playList.map(async (item) => {
            const title = item.episode.title + ' - ' + item.episode.podcast.title;
            const eid = item.episode.eid;
            const itunes_item_image = item.episode.image ? item.episode.image.picUrl : item.episode.podcast.image ? item.episode.podcast.image.picUrl : '';
            const link = `https://www.xiaoyuzhoufm.com/episode/${eid}`;
            const pubDate = item.pubDate;
            const enclosure_length = item.episode.duration;
            const enclosure_url = item.episode.enclosure.url;
            const desc = `<p><strong>${item.comment.author.nickname}：</strong>${item.comment.text}</p><hr>` + item.episode.shownotes;
            const author = item.episode.podcast.author;

            const resultItem = {
                title: title,
                description: desc,
                link: link,
                author: author,
                pubDate: pubDate,
                enclosure_url: enclosure_url,
                enclosure_length: enclosure_length,
                itunes_item_image: itunes_item_image,
                enclosure_type: 'audio/mpeg',
            };
            return Promise.resolve(resultItem);
        })
    );
};

module.exports = async (ctx) => {
    let resultItems = await ctx.cache.tryGet(XIAOYUZHOU_ITEMS, async () => await ProcessFeed(ctx));
    if (!isToday(resultItems[0].pubDate)) {
        // force refresh cache
        resultItems = await ProcessFeed(ctx);
        ctx.cache.set(XIAOYUZHOU_ITEMS, resultItems);
    }
    ctx.state.data = {
        title: '小宇宙 - 发现',
        link: 'https://www.xiaoyuzhoufm.com/',
        description: '小宇宙的编辑精选',
        image: 'https://www.xiaoyuzhoufm.com/apple-touch-icon.png',
        itunes_author: '小宇宙',
        itunes_category: 'Society & Culture',
        item: resultItems,
    };
};
