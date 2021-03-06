module.exports = app => {
  class Controller extends app.Controller {
    // GET start end
    async index() {
      const { ctx } = this;
      const { query, queries } = ctx;
      const args = [];
      let matchArgs = [];
      if (query.customerId) {
        matchArgs.push({ customerId: ctx.app.mongoose.Types.ObjectId(query.customerId) });
      }
      matchArgs.push({ hasPaid: true });
      if (query.isNameFiltered) {
        const regexStr = `.*${query.isNameFiltered.replace(/-|\s+/g, '.*')}.*`;
        matchArgs.push({ name: { $regex: new RegExp(regexStr) } });
      }
      if (query.updatedAtFilter) {
        console.log(queries.updatedAtFilter[0]);
        console.log(queries.updatedAtFilter[1]);

        matchArgs.push({
          updatedAt: {
            $gte: new Date(queries.updatedAtFilter[0]),
            $lte: new Date(queries.updatedAtFilter[1])
          }
        });
      }
      matchArgs = { $and: matchArgs };
      args.push({ $match: matchArgs });
      console.log(matchArgs);
      const total = await ctx.model.Order.find(matchArgs).countDocuments();
      args.push({
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      });
      // args.push({
      //   $match: {
      //     $expr: {
      //       $gt: [{ $size: '$customer' }, 0]
      //     }
      //   }
      // });
      args.push({
        $project: {
          name: 1,
          customerId: 1,
          totalFee: 1,
          description: 1,
          updatedAt: 1,
          customerName: {
            $let: {
              vars: {
                target: { $arrayElemAt: ['$customer', 0] }
              },
              in: '$$target.info.company'
            }
          }
        }
      });
      const $sort = {};
      if (query.totalFeeSort) $sort.totalFee = parseInt(query.totalFeeSort, 10);
      if (query.updatedAtSort) $sort.updatedAt = parseInt(query.updatedAtSort, 10);
      if (!Object.keys($sort).length) $sort._id = -1;
      args.push({ $sort });
      args.push({ $skip: (query.current - 1) * 10 });
      args.push({ $limit: 10 });
      console.log(JSON.stringify(args));
      const orders = await ctx.model.Order.aggregate(args);
      console.log(orders.length);
      ctx.body = { orders, total };
    }
  }
  return Controller;
};
